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
    private let handler: @Sendable (Data) async -> Data
    private let descriptor = Mutex<Int32>(-1)

    public init(path: String, handler: @escaping @Sendable (Data) async -> Data) {
        self.path = path
        self.handler = handler
    }

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
            unlink(path)
            let fd = socket(AF_UNIX, SOCK_STREAM, 0)
            guard fd >= 0 else { throw ControlSocketError.posix("socket") }
            guard UnixSocket.withSockaddr(&address, { bind(fd, $0, $1) }) == 0 else {
                let error = ControlSocketError.posix("bind \(path)")
                close(fd)
                throw error
            }
            chmod(path, 0o600)
            guard listen(fd, 8) == 0 else {
                let error = ControlSocketError.posix("listen")
                close(fd)
                unlink(path)
                throw error
            }
            descriptor = fd
            let handler = handler
            DispatchQueue.global(qos: .userInitiated).async { Self.acceptLoop(fd, handler) }
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

    private static func acceptLoop(_ listener: Int32, _ handler: @escaping @Sendable (Data) async -> Data) {
        while true {
            let connection = accept(listener, nil, nil)
            if connection < 0 {
                if errno == EINTR { continue }
                return
            }
            DispatchQueue.global(qos: .userInitiated).async { serve(connection, handler) }
        }
    }

    private static func serve(_ connection: Int32, _ handler: @escaping @Sendable (Data) async -> Data) {
        defer { close(connection) }
        var buffer: [UInt8] = []
        while let line = try? UnixSocket.readLine(from: connection, buffer: &buffer) {
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
