//
//  ControlServer.swift
//  MarkupEditorAppLib
//

import Foundation
import Darwin
import Synchronization

/// Listens on a Unix domain socket and answers newline-delimited requests with `handler`.
/// The socket file is mode 0600, so only the owning user's processes can connect.
public final class ControlServer: Sendable {

    private let path: String
    private let peerVerifier: PeerVerifying
    private let handler: @Sendable (Data) async -> Data
    private let descriptor = Mutex<Int32>(-1)
    /// The write end of the pipe that wakes the accept loop when the server stops. Guarded by `descriptor`'s lock.
    private let wakeWriter = Mutex<Int32>(-1)
    private let connections = Mutex<Int>(0)
    private let accepting = Mutex<Bool>(false)

    /// Whether the accept loop is running. Tests use it to see when a stop has taken effect.
    var isAccepting: Bool { accepting.withLock { $0 } }

    /// Connections served at once unless the caller asks for a different limit.
    static let maxConnections = 16
    /// Seconds a connection may sit without sending a request before it is closed.
    static let idleSeconds = 30

    /// Connections served at once; further ones are closed on arrival.
    let connectionLimit: Int

    /// Connections being served right now.
    var activeConnections: Int { connections.withLock { $0 } }

    /// - Parameter peerVerifier: A connecting process that fails it is told so and disconnected
    ///   before any request is read.
    /// - Parameter connectionLimit: Connections served at once; further ones are closed on arrival. Defaults to `maxConnections`.
    public init(path: String, peerVerifier: PeerVerifying, connectionLimit: Int? = nil, handler: @escaping @Sendable (Data) async -> Data) {
        self.path = path
        self.peerVerifier = peerVerifier
        self.connectionLimit = connectionLimit ?? Self.maxConnections
        self.handler = handler
    }

#if DEBUG
    /// Tests: accepts every peer.
    public convenience init(path: String, connectionLimit: Int? = nil, handler: @escaping @Sendable (Data) async -> Data) {
        self.init(path: path, peerVerifier: AcceptAnyPeer(), connectionLimit: connectionLimit, handler: handler)
    }
#endif

    /// Binds the socket, replacing a stale file from an earlier run, and starts accepting.
    public func start() throws {
        try descriptor.withLock { descriptor in
            guard descriptor < 0 else { return }
            var address = try UnixSocket.address(for: path)
            try? FileManager.default.createDirectory(atPath: (path as NSString).deletingLastPathComponent, withIntermediateDirectories: true)
            // Another running copy of the app may own this path; only a dead socket file is replaced.
            if UnixSocket.isLive(path: path) {
                throw ControlSocketError("Another process is already listening at \(path)")
            }
            if UnixSocket.isSocketFile(path) { unlink(path) }
            // A client can hang up before its reply is written, and a write to a closed connection
            // raises SIGPIPE, whose default action ends the process. Ignore it for the whole process, and
            // set the option on the listener so accepted connections inherit it even when the client is
            // gone before this process can set it on them.
            signal(SIGPIPE, SIG_IGN)
            let fd = socket(AF_UNIX, SOCK_STREAM, 0)
            guard fd >= 0 else { throw ControlSocketError.posix("socket") }
            UnixSocket.suppressSigPipe(fd)
            guard UnixSocket.withSockaddr(&address, { bind(fd, $0, $1) }) == 0 else {
                let error = ControlSocketError.posix("bind \(path)")
                close(fd)
                throw error
            }
            guard chmod(path, 0o600) == 0 else {
                let error = ControlSocketError.posix("chmod \(path)")
                close(fd)
                unlink(path)
                throw error
            }
            guard listen(fd, 8) == 0 else {
                let error = ControlSocketError.posix("listen")
                close(fd)
                unlink(path)
                throw error
            }
            // The loop waits on this pipe as well as the listener, so stop() can end the wait at once instead of the
            // loop waking on a timer to look for a stop.
            var pipeEnds: [Int32] = [-1, -1]
            guard pipe(&pipeEnds) == 0 else {
                let error = ControlSocketError.posix("pipe")
                close(fd)
                unlink(path)
                throw error
            }
            for end in pipeEnds { _ = fcntl(end, F_SETFD, FD_CLOEXEC) }
            _ = fcntl(pipeEnds[1], F_SETFL, fcntl(pipeEnds[1], F_GETFL) | O_NONBLOCK)
            descriptor = fd
            wakeWriter.withLock { $0 = pipeEnds[1] }
            let wakeReader = pipeEnds[0]
            let handler = handler
            let verifier = peerVerifier
            DispatchQueue.global(qos: .userInitiated).async { [self] in acceptLoop(fd, wakeReader, verifier, handler) }
        }
    }

    public func stop() {
        descriptor.withLock { descriptor in
            guard descriptor >= 0 else { return }
            // The accept loop is woken through its pipe and closes the listener on its way out.
            // Closing it here frees the descriptor number while the loop can still call accept on it, and a
            // socket created in the meantime would reuse the number and have its connections taken by this loop.
            descriptor = -1
            unlink(path)
            wakeWriter.withLock { writer in
                var byte: UInt8 = 0
                _ = write(writer, &byte, 1)
                close(writer)
                writer = -1
            }
        }
    }

    deinit {
        stop()
    }

    private func acceptLoop(_ listener: Int32, _ wakeReader: Int32, _ verifier: PeerVerifying, _ handler: @escaping @Sendable (Data) async -> Data) {
        // The loop owns the listener and the read end of the wake pipe from here on; see stop().
        accepting.withLock { $0 = true }
        defer {
            close(listener)
            close(wakeReader)
            accepting.withLock { $0 = false }
        }
        while true {
            // stop() clears the stored descriptor. Checking first means a stopped server never calls accept,
            // and polling means a blocked accept never keeps the loop from noticing.
            guard descriptor.withLock({ $0 }) == listener else { return }
            var ready = [
                pollfd(fd: listener, events: Int16(POLLIN), revents: 0),
                pollfd(fd: wakeReader, events: Int16(POLLIN), revents: 0),
            ]
            let polled = poll(&ready, 2, -1)
            if polled < 0 && errno == EINTR { continue }
            if polled < 0 { return }
            // stop() wrote to the pipe, or closed its end.
            if ready[1].revents != 0 { return }
            // Anything the listener reports goes to accept, which fails and ends the loop if the listener is broken.
            if polled == 0 || ready[0].revents == 0 { continue }
            let connection = accept(listener, nil, nil)
            if connection < 0 {
                // Transient failures, such as a connection aborted before it was accepted or a full
                // descriptor table, must not end the listener; stop() closing it does.
                if descriptor.withLock({ $0 }) == listener, errno != EBADF, errno != EINVAL {
                    if errno != EINTR && errno != ECONNABORTED { usleep(50_000) }
                    continue
                }
                return
            }
            let admitted = connections.withLock { count in
                guard count < connectionLimit else { return false }
                count += 1
                return true
            }
            guard admitted else {
                close(connection)
                continue
            }
            DispatchQueue.global(qos: .userInitiated).async { [self] in
                Self.serve(connection, verifier, handler)
                connections.withLock { $0 -= 1 }
            }
        }
    }

    private static func serve(_ connection: Int32, _ verifier: PeerVerifying, _ handler: @escaping @Sendable (Data) async -> Data) {
        defer { close(connection) }
        // A client may hang up before its reply is ready; that must not take the app down.
        UnixSocket.suppressSigPipe(connection)
        var idle = timeval(tv_sec: idleSeconds, tv_usec: 0)
        setsockopt(connection, SOL_SOCKET, SO_RCVTIMEO, &idle, socklen_t(MemoryLayout<timeval>.size))
        if !verifier.verify(descriptor: connection) {
            let refusal = ControlResponse.failure(id: -1, "Refused: only the markup command line tool shipped with MarkupEditor may connect")
            if let data = try? JSONEncoder().encode(refusal) { try? UnixSocket.writeLine(data, to: connection) }
            return
        }
        var buffer: [UInt8] = []
        while let line = try? UnixSocket.readLine(from: connection, buffer: &buffer, maxBytes: UnixSocket.maxRequestBytes) {
            guard !line.isEmpty else { continue }
            let reply = blockingResult { await handler(line) }
            guard (try? UnixSocket.writeLine(reply, to: connection)) != nil else { return }
        }
    }

    /// Runs `work` and waits for it on this (non-cooperative) thread.
    private static func blockingResult(_ work: @escaping @Sendable () async -> Data) -> Data {
        let semaphore = DispatchSemaphore(value: 0)
        let result = Mutex<Data>(Data())
        Task {
            let data = await work()
            result.withLock { $0 = data }
            semaphore.signal()
        }
        semaphore.wait()
        return result.withLock { $0 }
    }
}
