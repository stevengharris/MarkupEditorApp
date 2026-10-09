//
//  UnixSocket.swift
//  MarkupEditorAppLib
//

import Foundation
import Darwin

/// Failures setting up or using the control socket.
public struct ControlSocketError: Error, LocalizedError, Equatable {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }

    static func posix(_ action: String) -> ControlSocketError {
        ControlSocketError("\(action): \(String(cString: strerror(errno)))")
    }
}

enum UnixSocket {

    /// Longest line either side accepts. A PNG screenshot is the largest legitimate payload.
    static let maxLineBytes = 32 * 1024 * 1024

    /// Makes a write to a descriptor whose other end has gone return an error instead of raising
    /// SIGPIPE, which would silently terminate the whole process.
    static func suppressSigPipe(_ descriptor: Int32) {
        var on: Int32 = 1
        // SO_NOSIGPIPE is the socket option; a pipe, such as standard output, needs the fcntl form.
        if setsockopt(descriptor, SOL_SOCKET, SO_NOSIGPIPE, &on, socklen_t(MemoryLayout<Int32>.size)) != 0 {
            _ = fcntl(descriptor, F_SETNOSIGPIPE, 1)
        }
    }

    static func address(for path: String) throws -> sockaddr_un {
        var address = sockaddr_un()
        address.sun_family = sa_family_t(AF_UNIX)
        let capacity = MemoryLayout.size(ofValue: address.sun_path)
        guard path.utf8.count < capacity else {
            throw ControlSocketError("Socket path is too long (\(path.utf8.count) of \(capacity - 1) bytes): \(path)")
        }
        withUnsafeMutableBytes(of: &address.sun_path) { buffer in
            _ = path.withCString { strncpy(buffer.baseAddress!.assumingMemoryBound(to: CChar.self), $0, capacity - 1) }
        }
        return address
    }

    static func withSockaddr<T>(_ address: inout sockaddr_un, _ body: (UnsafePointer<sockaddr>, socklen_t) -> T) -> T {
        withUnsafePointer(to: &address) { pointer in
            pointer.withMemoryRebound(to: sockaddr.self, capacity: 1) {
                body($0, socklen_t(MemoryLayout<sockaddr_un>.size))
            }
        }
    }

    /// True when a process is accepting connections at `path`. A leftover socket file from a crashed
    /// run, or a file that is not a socket, is not live.
    static func isLive(path: String) -> Bool {
        guard var address = try? address(for: path) else { return false }
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { return false }
        defer { close(fd) }
        return withSockaddr(&address) { connect(fd, $0, $1) } == 0
    }

    /// Reads from `descriptor` until a newline, returning the line without it, or nil at end of stream.
    /// `buffer` carries bytes read past the newline to the next call.
    static func readLine(from descriptor: Int32, buffer: inout [UInt8]) throws -> Data? {
        var chunk = [UInt8](repeating: 0, count: 64 * 1024)
        var scanned = 0     // Bytes of `buffer` already known to hold no newline
        while true {
            if let newline = buffer[scanned...].firstIndex(of: UInt8(ascii: "\n")) {
                let line = Data(buffer[..<newline])
                buffer.removeSubrange(...newline)
                return line
            }
            scanned = buffer.count
            guard buffer.count <= maxLineBytes else { throw ControlSocketError("Line exceeds \(maxLineBytes) bytes") }
            let count = read(descriptor, &chunk, chunk.count)
            if count < 0 {
                if errno == EINTR { continue }
                throw ControlSocketError.posix("read")
            }
            if count == 0 {
                guard !buffer.isEmpty else { return nil }
                defer { buffer.removeAll() }
                return Data(buffer)
            }
            buffer.append(contentsOf: chunk[..<count])
        }
    }

    static func writeLine(_ data: Data, to descriptor: Int32) throws {
        var bytes = [UInt8](data)
        bytes.append(UInt8(ascii: "\n"))
        var offset = 0
        while offset < bytes.count {
            let written = bytes[offset...].withUnsafeBytes { write(descriptor, $0.baseAddress, $0.count) }
            if written < 0 {
                if errno == EINTR { continue }
                throw ControlSocketError.posix("write")
            }
            offset += written
        }
    }
}
