//
//  MCPServer.swift
//  MarkupEditorAppLib
//

import Foundation
import Synchronization

/// A piece of a tool result, as MCP carries it.
public enum MCPContent: Sendable, Equatable {
    case text(String)
    case image(base64: String, mimeType: String)

    var json: JSONValue {
        switch self {
        case .text(let text): ["type": "text", "text": .string(text)]
        case .image(let base64, let mimeType): ["type": "image", "data": .string(base64), "mimeType": .string(mimeType)]
        }
    }
}

public struct MCPToolResult: Sendable, Equatable {
    public var content: [MCPContent]
    public var isError: Bool

    public init(_ content: [MCPContent], isError: Bool = false) {
        self.content = content
        self.isError = isError
    }

    public static func error(_ message: String) -> MCPToolResult {
        MCPToolResult([.text(message)], isError: true)
    }
}

/// A Model Context Protocol server speaking JSON-RPC 2.0 over newline-delimited stdio. It offers
/// tools only; `call` runs one.
public struct MCPServer: Sendable {

    public typealias CallTool = @Sendable (_ name: String, _ arguments: JSONValue) async -> MCPToolResult

    public typealias ListTools = @Sendable () async -> [ControlTool]

    static let supportedVersions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"]

    private let name: String
    private let version: String
    private let tools: ListTools
    private let knownNames: Set<String>?
    private let call: CallTool
    private let advertised = AdvertisedTools()

    /// - Parameters:
    ///   - tools: Asked on every `tools/list`, so the offer follows what is available.
    ///   - knownNames: Tool names that may be called whether or not they are offered right now. A
    ///     client with an older list can then get the app's own explanation, such as "read-only
    ///     access", instead of a bare unknown-tool error. Nil limits calls to the offered tools.
    public init(name: String, version: String, tools: @escaping ListTools, knownNames: Set<String>? = nil, call: @escaping CallTool) {
        self.name = name
        self.version = version
        self.tools = tools
        self.knownNames = knownNames
        self.call = call
    }

    public init(name: String, version: String, tools: [ControlTool], call: @escaping CallTool) {
        self.init(name: name, version: version, tools: { tools }, call: call)
    }

    /// Handles one message and returns the reply line, or nil when none is due (notifications).
    public func handle(_ message: Data) async -> Data? {
        guard let object = try? JSONDecoder().decode(JSONValue.self, from: message), case .object = object else {
            return encode(error: -32700, "Parse error", id: .null)
        }
        guard let method = object["method"]?.stringValue else {
            // A response to a request this server never makes, or garbage.
            return object["id"] == nil ? nil : encode(error: -32600, "Invalid request", id: object["id"] ?? .null)
        }
        guard let id = object["id"] else { return nil }     // Notification: no reply
        let params = object["params"] ?? [:]

        switch method {
        case "initialize":
            let requested = params["protocolVersion"]?.stringValue ?? ""
            let negotiated = Self.supportedVersions.contains(requested) ? requested : Self.supportedVersions[0]
            return encode(result: [
                "protocolVersion": .string(negotiated),
                "capabilities": ["tools": ["listChanged": true]],
                "serverInfo": ["name": .string(name), "version": .string(version)],
            ], id: id)
        case "ping":
            return encode(result: [:], id: id)
        case "tools/list":
            let offered = await tools()
            advertised.set(offered.map(\.name))
            return encode(result: ["tools": .array(offered.map(toolJSON))], id: id)
        case "tools/call":
            guard let toolName = params["name"]?.stringValue else {
                return encode(error: -32602, "tools/call requires a tool name", id: id)
            }
            let callable: Set<String>
            if let knownNames { callable = knownNames } else { callable = Set(await tools().map(\.name)) }
            guard callable.contains(toolName) else {
                return encode(error: -32602, "Unknown tool: \(toolName)", id: id)
            }
            let result = await call(toolName, params["arguments"] ?? [:])
            return encode(result: [
                "content": .array(result.content.map(\.json)),
                "isError": .bool(result.isError),
            ], id: id)
        default:
            return encode(error: -32601, "Method not found: \(method)", id: id)
        }
    }

    /// Reads requests from `input` until it closes, writing replies to `output`. After the client
    /// reports it is initialized, the offered tools are re-checked every `pollInterval` and a
    /// `tools/list_changed` notification is sent when they differ from what was last listed.
    public func run(input: FileHandle, output: FileHandle, pollInterval: Duration = .seconds(3)) async {
        // If the client closes our output, a write should fail quietly; the loop ends when input closes.
        UnixSocket.suppressSigPipe(output.fileDescriptor)
        let writer = LineWriter(descriptor: output.fileDescriptor)
        var watcher: Task<Void, Never>?
        defer { watcher?.cancel() }
        var buffer: [UInt8] = []
        while let line = try? UnixSocket.readLine(from: input.fileDescriptor, buffer: &buffer) {
            guard !line.isEmpty else { continue }
            if watcher == nil, Self.isInitializedNotification(line) {
                watcher = Task { await watchTools(every: pollInterval, writer: writer) }
            }
            if let reply = await handle(line) { writer.write(reply) }
        }
    }

    private func watchTools(every interval: Duration, writer: LineWriter) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: interval)
            let names = await tools().map(\.name)
            guard let listed = advertised.names, listed != names else { continue }
            advertised.set(names)
            if let notification = try? JSONEncoder().encode(JSONValue.object(["jsonrpc": "2.0", "method": "notifications/tools/list_changed"])) {
                writer.write(notification)
            }
        }
    }

    private static func isInitializedNotification(_ line: Data) -> Bool {
        (try? JSONDecoder().decode(JSONValue.self, from: line))?["method"]?.stringValue == "notifications/initialized"
    }

    private func toolJSON(_ tool: ControlTool) -> JSONValue {
        [
            "name": .string(tool.name),
            "title": .string(tool.title),
            "description": .string(tool.description),
            "inputSchema": tool.inputSchema,
            "annotations": tool.annotations.json,
        ]
    }

    private func encode(result: JSONValue, id: JSONValue) -> Data? {
        try? JSONEncoder().encode(JSONValue.object(["jsonrpc": "2.0", "id": id, "result": result]))
    }

    private func encode(error code: Int, _ message: String, id: JSONValue) -> Data? {
        try? JSONEncoder().encode(JSONValue.object(["jsonrpc": "2.0", "id": id, "error": ["code": .number(Double(code)), "message": .string(message)]]))
    }
}

/// The tool names last sent to the client, shared by copies of the server.
private final class AdvertisedTools: Sendable {
    private let value = Mutex<[String]?>(nil)
    var names: [String]? { value.withLock { $0 } }
    func set(_ names: [String]) { value.withLock { $0 = names } }
}

/// Serializes writes from the request loop and the tool watcher onto one descriptor.
private final class LineWriter: Sendable {
    private let descriptor: Int32
    private let lock = Mutex<Void>(())
    init(descriptor: Int32) { self.descriptor = descriptor }
    func write(_ data: Data) {
        lock.withLock { _ in try? UnixSocket.writeLine(data, to: descriptor) }
    }
}
