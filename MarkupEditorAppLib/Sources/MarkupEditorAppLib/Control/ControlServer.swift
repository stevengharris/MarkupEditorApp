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
    private let connections = Mutex<Int>(0)

    /// Connections served at once; further ones are closed on arrival.
    static let maxConnections = 16
    /// Seconds a connection may sit without sending a request before it is closed.
    static let idleSeconds = 30

    /// - Parameter peerVerifier: A connecting process that fails it is told so and disconnected
    ///   before any request is read.
    public init(path: String, peerVerifier: PeerVerifying, handler: @escaping @Sendable (Data) async -> Data) {
        self.path = path
        self.peerVerifier = peerVerifier
        self.handler = handler
    }

#if DEBUG
    /// Tests: accepts every peer.
    public convenience init(path: String, handler: @escaping @Sendable (Data) async -> Data) {
        self.init(path: path, peerVerifier: AcceptAnyPeer(), handler: handler)
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
            descriptor = fd
            let handler = handler
            let verifier = peerVerifier
            DispatchQueue.global(qos: .userInitiated).async { [self] in acceptLoop(fd, verifier, handler) }
        }
    }

    public func stop() {
        descriptor.withLock { descriptor in
            guard descriptor >= 0 else { return }
            shutdown(descriptor, SHUT_RDWR)
            close(descriptor)
            descriptor = -1
            unlink(path)
        }
    }

    deinit {
        stop()
    }

    private func acceptLoop(_ listener: Int32, _ verifier: PeerVerifying, _ handler: @escaping @Sendable (Data) async -> Data) {
        while true {
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
                guard count < Self.maxConnections else { return false }
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
