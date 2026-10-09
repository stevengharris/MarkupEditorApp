//
//  ControlClient.swift
//  MarkupEditorAppLib
//

import Foundation
import Darwin

/// Sends requests to the app's control socket and returns the replies.
public struct ControlClient: Sendable {

    public let path: String
    public let timeout: TimeInterval

    public init(path: String, timeout: TimeInterval = 30) {
        self.path = path
        self.timeout = timeout
    }

    /// Where the debug app listens, as seen from outside its sandbox: inside its container, the only
    /// place the sandbox lets it bind. The container's tmp folder keeps the path short, because a
    /// socket path is limited to 103 bytes; the full path leaves room for a 25 character user name.
    public static func defaultPath(home: String = NSHomeDirectory(), bundleIdentifier: String = "com.stevengharris.MarkupEditorApp") -> String {
        appPath(containerHome: "\(home)/Library/Containers/\(bundleIdentifier)/Data")
    }

    /// Where the app binds, given `NSHomeDirectory()` as the app sees it, which inside the sandbox is the container.
    public static func appPath(containerHome: String) -> String {
        "\(containerHome)/tmp/mcp.sock"
    }

    public func send(_ request: ControlRequest) async throws -> ControlResponse {
        let line = try JSONEncoder().encode(request)
        let path = path
        let timeout = timeout
        let reply = try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Data, Error>) in
            DispatchQueue.global(qos: .userInitiated).async {
                continuation.resume(with: Result { try Self.exchange(line, path: path, timeout: timeout) })
            }
        }
        return try JSONDecoder().decode(ControlResponse.self, from: reply)
    }

    private static func exchange(_ line: Data, path: String, timeout: TimeInterval) throws -> Data {
        var address = try UnixSocket.address(for: path)
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        guard fd >= 0 else { throw ControlSocketError.posix("socket") }
        defer { close(fd) }
        UnixSocket.suppressSigPipe(fd)
        var limit = timeval(tv_sec: Int(timeout), tv_usec: 0)
        setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &limit, socklen_t(MemoryLayout<timeval>.size))
        setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &limit, socklen_t(MemoryLayout<timeval>.size))
        guard UnixSocket.withSockaddr(&address, { connect(fd, $0, $1) }) == 0 else {
            throw ControlSocketError("MarkupEditor is not listening at \(path). Start MarkupEditor and turn on Assistants in its settings. (\(String(cString: strerror(errno))))")
        }
        try UnixSocket.writeLine(line, to: fd)
        var buffer: [UInt8] = []
        guard let reply = try UnixSocket.readLine(from: fd, buffer: &buffer) else {
            throw ControlSocketError("The app closed the connection without replying")
        }
        return reply
    }
}
