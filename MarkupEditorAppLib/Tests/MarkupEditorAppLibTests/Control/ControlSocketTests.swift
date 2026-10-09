//
//  ControlSocketTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Darwin
import Testing
@testable import MarkupEditorAppLib

struct ControlSocketTests {

    /// A short path: sockaddr_un limits the whole path to 103 bytes.
    func socketPath() -> String {
        "/tmp/mecs-\(UUID().uuidString.prefix(8)).sock"
    }

    func echoServer(at path: String) throws -> ControlServer {
        let server = ControlServer(path: path) { line in
            guard let request = try? JSONDecoder().decode(ControlRequest.self, from: line) else {
                return (try? JSONEncoder().encode(ControlResponse.failure(id: -1, "bad"))) ?? Data()
            }
            return (try? JSONEncoder().encode(ControlResponse.success(id: request.id, request.args))) ?? Data()
        }
        try server.start()
        return server
    }

    @Test func aRequestRoundTripsThroughTheSocket() async throws {
        let path = socketPath()
        let server = try echoServer(at: path)
        defer { server.stop() }

        let response = try await ControlClient(path: path).send(ControlRequest(id: 5, tool: "x", args: ["a": "b"]))

        #expect(response == .success(id: 5, ["a": "b"]))
    }

    @Test func manyRequestsWorkAcrossConnections() async throws {
        let path = socketPath()
        let server = try echoServer(at: path)
        defer { server.stop() }
        let client = ControlClient(path: path)

        let ids = try await withThrowingTaskGroup(of: Int.self) { group in
            for id in 1...12 { group.addTask { try await client.send(ControlRequest(id: id, tool: "x")).id } }
            return try await group.reduce(into: Set<Int>()) { $0.insert($1) }
        }

        #expect(ids == Set(1...12))
    }

    @Test func aLargePayloadRoundTrips() async throws {
        let path = socketPath()
        let server = try echoServer(at: path)
        defer { server.stop() }
        let big = String(repeating: "x", count: 3_000_000)

        let response = try await ControlClient(path: path).send(ControlRequest(id: 1, tool: "x", args: ["big": .string(big)]))

        #expect(response.result?["big"]?.stringValue?.count == 3_000_000)
    }

    @Test func theSocketIsPrivateToTheOwner() throws {
        let path = socketPath()
        let server = try echoServer(at: path)
        defer { server.stop() }

        let permissions = try FileManager.default.attributesOfItem(atPath: path)[.posixPermissions] as? Int
        #expect(permissions == 0o600)
    }

    @Test func stoppingRemovesTheSocketFile() throws {
        let path = socketPath()
        let server = try echoServer(at: path)
        #expect(FileManager.default.fileExists(atPath: path))
        server.stop()
        #expect(!FileManager.default.fileExists(atPath: path))
    }

    @Test func aFileThatIsNotASocketIsNeverDeleted() throws {
        let path = socketPath()
        FileManager.default.createFile(atPath: path, contents: Data("keep".utf8))
        defer { try? FileManager.default.removeItem(atPath: path) }

        #expect(throws: ControlSocketError.self) { try ControlServer(path: path) { $0 }.start() }

        #expect(FileManager.default.contents(atPath: path) == Data("keep".utf8))
    }

    @Test func aRequestOverTheSizeLimitEndsTheConnection() async throws {
        let path = socketPath()
        let server = try echoServer(at: path)
        defer { server.stop() }
        let tooBig = String(repeating: "x", count: UnixSocket.maxRequestBytes + 1024)

        await #expect(throws: (any Error).self) {
            try await ControlClient(path: path).send(ControlRequest(id: 1, tool: "x", args: ["big": .string(tooBig)]))
        }
    }

    @Test func connectionsBeyondTheLimitAreClosed() throws {
        let path = socketPath()
        let server = try echoServer(at: path)
        defer { server.stop() }
        func connect() throws -> Int32 {
            var address = try UnixSocket.address(for: path)
            let fd = socket(AF_UNIX, SOCK_STREAM, 0)
            #expect(UnixSocket.withSockaddr(&address, { Darwin.connect(fd, $0, $1) }) == 0)
            // The listen backlog is small; let the server accept before the next arrives.
            Thread.sleep(forTimeInterval: 0.02)
            return fd
        }
        let held = try (0..<ControlServer.maxConnections).map { _ in try connect() }
        defer { held.forEach { close($0) } }
        Thread.sleep(forTimeInterval: 0.3)

        let extra = try connect()
        defer { close(extra) }
        var limit = timeval(tv_sec: 2, tv_usec: 0)
        setsockopt(extra, SOL_SOCKET, SO_RCVTIMEO, &limit, socklen_t(MemoryLayout<timeval>.size))
        var byte: UInt8 = 0

        // A closed connection reads as end of stream; an admitted one would wait for a request.
        #expect(read(extra, &byte, 1) == 0)
    }

    @Test func aSecondServerCannotTakeOverALiveSocket() async throws {
        let path = socketPath()
        let first = try echoServer(at: path)
        defer { first.stop() }

        #expect(throws: ControlSocketError.self) { try ControlServer(path: path) { $0 }.start() }

        let response = try await ControlClient(path: path).send(ControlRequest(id: 3, tool: "x", args: ["still": "first"]))
        #expect(response == .success(id: 3, ["still": "first"]))
    }

    @Test func aSocketFileLeftByACrashedRunIsReplaced() throws {
        let path = socketPath()
        var address = try UnixSocket.address(for: path)
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        #expect(UnixSocket.withSockaddr(&address) { bind(fd, $0, $1) } == 0)
        close(fd)      // The file stays behind with nothing listening, as after a crash
        #expect(FileManager.default.fileExists(atPath: path))
        #expect(!UnixSocket.isLive(path: path))

        let server = try echoServer(at: path)
        defer { server.stop() }
        #expect(UnixSocket.isLive(path: path))
    }

    @Test func connectingWithoutAServerSaysSo() async {
        let path = socketPath()
        await #expect(throws: ControlSocketError.self) {
            _ = try await ControlClient(path: path).send(ControlRequest(id: 1, tool: "x"))
        }
    }

    @Test func aTooLongPathIsRejected() {
        let path = "/tmp/" + String(repeating: "a", count: 120)
        #expect(throws: ControlSocketError.self) { try ControlServer(path: path) { $0 }.start() }
    }

    @Test func theAppAndTheClientAgreeOnThePath() {
        let container = "/Users/u/Library/Containers/com.stevengharris.MarkupEditorApp/Data"
        #expect(ControlClient.appPath(containerHome: container) == ControlClient.defaultPath(home: "/Users/u"))
    }

    @Test func theDefaultPathFitsAUserNameUpTo25Characters() {
        let longest = String(repeating: "a", count: 25)
        #expect(ControlClient.defaultPath(home: "/Users/\(longest)").utf8.count <= 103)
        #expect(ControlClient.defaultPath(home: "/Users/\(longest)a").utf8.count > 103)
    }

    @Test func aTooLongPathSaysHowLongItIs() {
        let path = ControlClient.defaultPath(home: "/Users/" + String(repeating: "a", count: 40))
        let error = #expect(throws: ControlSocketError.self) { try ControlServer(path: path) { $0 }.start() }
        #expect(error?.message.contains("too long") == true)
        #expect(error?.message.contains(path) == true)
    }

    @Test func theDefaultPathIsInsideTheAppContainer() {
        #expect(ControlClient.defaultPath(home: "/Users/u") == "/Users/u/Library/Containers/com.stevengharris.MarkupEditorApp/Data/tmp/mcp.sock")
        #expect(ControlClient.defaultPath().utf8.count < 104)
    }
}

struct ControlSocketDisconnectTests {

    func socketPath() -> String { "/tmp/mecd-\(UUID().uuidString.prefix(8)).sock" }

    /// Connects, sends one request, and disconnects without waiting for the reply.
    func requestAndHangUp(at path: String, line: String) throws {
        var address = try UnixSocket.address(for: path)
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        #expect(UnixSocket.withSockaddr(&address) { connect(fd, $0, $1) } == 0)
        try UnixSocket.writeLine(Data(line.utf8), to: fd)
        close(fd)
    }

    @Test func aClientThatHangsUpBeforeTheReplyDoesNotKillTheServer() async throws {
        let path = socketPath()
        // A slow handler, so the reply is written after the client has gone.
        let server = ControlServer(path: path) { line in
            try? await Task.sleep(for: .milliseconds(150))
            let request = try? JSONDecoder().decode(ControlRequest.self, from: line)
            return (try? JSONEncoder().encode(ControlResponse.success(id: request?.id ?? 0, "ok"))) ?? Data()
        }
        try server.start()
        defer { server.stop() }

        for id in 1...3 {
            let request = try JSONEncoder().encode(ControlRequest(id: id, tool: "x"))
            try requestAndHangUp(at: path, line: String(decoding: request, as: UTF8.self))
        }
        try await Task.sleep(for: .milliseconds(500))      // The replies are written to closed connections here.

        let response = try await ControlClient(path: path).send(ControlRequest(id: 9, tool: "x"))
        #expect(response == .success(id: 9, "ok"))
    }
}
