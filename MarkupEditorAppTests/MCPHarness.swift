//
//  MCPHarness.swift
//  MarkupEditorAppTests
//
//  Runs the app's control server in the test process on a temporary socket and the bundled
//  `markup mcp` as a child process, the way an assistant reaches the app.

import Foundation
import MarkupEditorAppLib
@testable import MarkupEditorApp

struct HarnessError: Error, CustomStringConvertible {
    let description: String
    init(_ description: String) { self.description = description }
}

/// Collects the child's JSON-RPC replies by id and lets a caller wait for one, with a deadline.
actor MCPReplies {
    private var replies: [Int: JSONValue] = [:]
    private var waiters: [Int: CheckedContinuation<JSONValue?, Never>] = [:]

    func deliver(_ reply: JSONValue) {
        guard let id = reply["id"]?.intValue else { return }
        if let waiter = waiters.removeValue(forKey: id) {
            waiter.resume(returning: reply)
        } else {
            replies[id] = reply
        }
    }

    func next(id: Int, seconds: Double) async -> JSONValue? {
        if let reply = replies.removeValue(forKey: id) { return reply }
        return await withCheckedContinuation { continuation in
            waiters[id] = continuation
            Task {
                try? await Task.sleep(for: .seconds(seconds))
                self.expire(id)
            }
        }
    }

    private func expire(_ id: Int) {
        waiters.removeValue(forKey: id)?.resume(returning: nil)
    }
}

/// An outcome of a tool call as the assistant sees it.
struct ToolOutcome {
    let text: String
    let isError: Bool

    /// The text parsed as JSON, for tools that reply with a JSON object.
    var json: JSONValue? { try? JSONDecoder().decode(JSONValue.self, from: Data(text.utf8)) }
}

@MainActor
final class MCPHarness {

    private let server: ControlServer
    private let process: Process
    private let input: FileHandle
    private let replies = MCPReplies()
    private let socketDirectory: URL
    private var nextID = 1
    fileprivate var output: FileHandle?

    /// The app's bundled `markup` tool: the test host is the app.
    static var bundledTool: URL? {
        let url = Bundle.main.bundleURL.appending(path: "Contents/Resources/bin/markup")
        return FileManager.default.isExecutableFile(atPath: url.path(percentEncoded: false)) ? url : nil
    }

    static func start(facade: any ControlFacade, access: ClientAccess = .readWrite, tools: [ControlTool] = ControlTools.endUser) async throws -> MCPHarness {
        guard let tool = bundledTool else { throw HarnessError("the bundled markup tool was not found in \(Bundle.main.bundlePath)") }
        // A Unix socket path is limited to about 100 bytes, so keep the directory name short.
        let directory = FileManager.default.temporaryDirectory.appending(path: "mc\(Int.random(in: 100_000...999_999))")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let socket = directory.appending(path: "s").path(percentEncoded: false)

        let dispatcher = ControlDispatcher(facade: facade, tools: tools, authorizer: HarnessAuthorizer(access))
        let server = ControlServer(path: socket) { line in await dispatcher.handle(line) }
        try server.start()

        let process = Process()
        process.executableURL = tool
        process.arguments = ["mcp", "--socket", socket]
        let stdin = Pipe(), stdout = Pipe()
        process.standardInput = stdin
        process.standardOutput = stdout
        process.standardError = FileHandle.nullDevice
        try process.run()

        let harness = MCPHarness(server: server, process: process, input: stdin.fileHandleForWriting, directory: directory)
        let replies = harness.replies
        let splitter = LineSplitter { line in
            guard let reply = try? JSONDecoder().decode(JSONValue.self, from: Data(line.utf8)) else { return }
            Task { await replies.deliver(reply) }
        }
        stdout.fileHandleForReading.readabilityHandler = { handle in splitter.add(handle.availableData) }
        harness.output = stdout.fileHandleForReading
        _ = try await harness.request("initialize", ["protocolVersion": "2025-06-18", "capabilities": [:], "clientInfo": ["name": "harness", "version": "1"]])
        try harness.write(["jsonrpc": "2.0", "method": "notifications/initialized"])
        return harness
    }

    private init(server: ControlServer, process: Process, input: FileHandle, directory: URL) {
        self.server = server
        self.process = process
        self.input = input
        self.socketDirectory = directory
    }

    private func write(_ message: JSONValue) throws {
        var data = try JSONEncoder().encode(message)
        data.append(0x0A)
        try input.write(contentsOf: data)
    }

    private func request(_ method: String, _ params: JSONValue) async throws -> JSONValue {
        let id = nextID
        nextID += 1
        try write(["jsonrpc": "2.0", "id": .number(Double(id)), "method": .string(method), "params": params])
        guard let reply = await replies.next(id: id, seconds: 60) else { throw HarnessError("no reply to \(method) within 60 seconds") }
        return reply
    }

    func toolNames() async throws -> [String] {
        let reply = try await request("tools/list", [:])
        guard case .array(let tools)? = reply["result"]?["tools"] else { throw HarnessError("tools/list reply: \(reply)") }
        return tools.compactMap { $0["name"]?.stringValue }
    }

    @discardableResult
    func call(_ name: String, _ arguments: JSONValue = [:]) async throws -> ToolOutcome {
        let reply = try await request("tools/call", ["name": .string(name), "arguments": arguments])
        if let error = reply["error"] { return ToolOutcome(text: "protocol error: \(error)", isError: true) }
        guard case .array(let content)? = reply["result"]?["content"] else { throw HarnessError("tools/call reply: \(reply)") }
        let text = content.compactMap { $0["text"]?.stringValue }.joined(separator: "\n")
        return ToolOutcome(text: text, isError: reply["result"]?["isError"] == true)
    }

    func stop() {
        output?.readabilityHandler = nil
        try? input.close()
        if process.isRunning { process.terminate() }
        server.stop()
        try? FileManager.default.removeItem(at: socketDirectory)
    }
}

/// Grants every client one fixed level of access.
@MainActor
final class HarnessAuthorizer: ControlAuthorizing {
    let access: ClientAccess
    init(_ access: ClientAccess) { self.access = access }
    func access(for client: ClientIdentity?, prompting: Bool) async -> ClientAccess { access }
}

/// Splits the child's output into lines as chunks arrive on a background queue.
final class LineSplitter: @unchecked Sendable {
    private let lock = NSLock()
    private var buffer = Data()
    private let onLine: @Sendable (String) -> Void

    init(onLine: @escaping @Sendable (String) -> Void) { self.onLine = onLine }

    func add(_ data: Data) {
        guard !data.isEmpty else { return }
        var lines: [String] = []
        lock.lock()
        buffer.append(data)
        while let newline = buffer.firstIndex(of: 0x0A) {
            lines.append(String(decoding: buffer[buffer.startIndex..<newline], as: UTF8.self))
            buffer.removeSubrange(buffer.startIndex...newline)
        }
        lock.unlock()
        lines.forEach(onLine)
    }
}
