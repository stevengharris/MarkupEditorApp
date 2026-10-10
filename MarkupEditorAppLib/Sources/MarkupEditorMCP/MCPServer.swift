//
//  MCPServer.swift
//  MarkupEditorMCP
//

import Foundation
import Logging
import MarkupEditorAppLib
import MCP
import Synchronization

extension MCPContent {
    var sdkContent: Tool.Content {
        switch self {
        case .text(let text): .text(text: text, annotations: nil, _meta: nil)
        case .image(let base64, let mimeType): .image(data: base64, mimeType: mimeType, annotations: nil, _meta: nil)
        }
    }
}

/// A Model Context Protocol server over newline-delimited stdio, built on the MCP Swift SDK. It
/// offers tools only; `call` runs one.
public struct MCPServer: Sendable {

    public typealias CallTool = @Sendable (_ name: String, _ arguments: JSONValue) async -> MCPToolResult

    public typealias ListTools = @Sendable () async -> [ControlTool]

    private let name: String
    private let version: String
    private let tools: ListTools
    private let knownNames: Set<String>?
    private let call: CallTool

    /// - Parameters:
    ///   - tools: Asked on every `tools/list`, so the offer follows what is available.
    ///   - knownNames: Tool names that may be called whether or not they are offered right now. A
    ///     client with an older list can then get the app's explanation, such as "read-only
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

    /// Serves requests read from `input` until it closes, writing replies to `output`. After the
    /// client reports it is initialized, the offered tools are re-checked every `pollInterval` and a
    /// `tools/list_changed` notification is sent when they differ from what was last listed.
    public func run(input: FileHandle, output: FileHandle, pollInterval: Duration = .seconds(3)) async {
        await serve(over: DescriptorTransport(input: input.fileDescriptor, output: output.fileDescriptor), pollInterval: pollInterval)
    }

    func serve(over transport: any Transport, pollInterval: Duration) async {
        let server = Server(name: name, version: version, capabilities: .init(tools: .init(listChanged: true)))
        let advertised = AdvertisedTools()
        let watcher = Watcher()

        await server.withMethodHandler(MCP.ListTools.self) { _ in
            let offered = await tools()
            advertised.set(offered.map(\.name))
            return .init(tools: try offered.map(Self.sdkTool))
        }
        await server.withMethodHandler(MCP.CallTool.self) { params in
            let callable: Set<String>
            if let knownNames { callable = knownNames } else { callable = Set(await tools().map(\.name)) }
            guard callable.contains(params.name) else {
                throw MCPError.invalidParams("Unknown tool: \(params.name)")
            }
            let arguments = try Self.convert(params.arguments ?? [:], to: JSONValue.self)
            let result = await call(params.name, arguments)
            return .init(content: result.content.map(\.sdkContent), isError: result.isError)
        }
        await server.onNotification(InitializedNotification.self) { _ in
            watcher.startOnce { await watchTools(server, advertised, every: pollInterval) }
        }

        do {
            try await server.start(transport: transport)
        } catch {
            return
        }
        await server.waitUntilCompleted()
        watcher.cancel()
        await server.stop()
    }

    private func watchTools(_ server: Server, _ advertised: AdvertisedTools, every interval: Duration) async {
        while !Task.isCancelled {
            try? await Task.sleep(for: interval)
            let names = await tools().map(\.name)
            guard let listed = advertised.names, listed != names else { continue }
            advertised.set(names)
            try? await server.notify(ToolListChangedNotification.message())
        }
    }

    private static func sdkTool(_ tool: ControlTool) throws -> Tool {
        var annotations = Tool.Annotations()
        annotations.readOnlyHint = tool.annotations.readOnly
        annotations.openWorldHint = false
        if !tool.annotations.readOnly { annotations.destructiveHint = tool.annotations.destructive }
        return Tool(
            name: tool.name,
            title: tool.title,
            description: tool.description,
            inputSchema: try convert(tool.inputSchema, to: Value.self),
            annotations: annotations)
    }

    private static func convert<From: Encodable, To: Decodable>(_ value: From, to type: To.Type) throws -> To {
        try JSONDecoder().decode(To.self, from: JSONEncoder().encode(value))
    }
}

/// The tool names last sent to the client, shared by copies of the server.
private final class AdvertisedTools: Sendable {
    private let value = Mutex<[String]?>(nil)
    var names: [String]? { value.withLock { $0 } }
    func set(_ names: [String]) { value.withLock { $0 = names } }
}

/// Runs the tool-list watcher once, however many times the client says it is initialized.
private final class Watcher: Sendable {
    private let task = Mutex<Task<Void, Never>?>(nil)
    func startOnce(_ work: @escaping @Sendable () async -> Void) {
        task.withLock { if $0 == nil { $0 = Task { await work() } } }
    }
    func cancel() { task.withLock { $0?.cancel() } }
}

/// Newline-delimited JSON over a pair of descriptors. Input is read on a dedicated thread so a
/// blocking read never holds a cooperative-pool thread, and the descriptors stay in blocking mode.
actor DescriptorTransport: Transport {
    nonisolated let logger = Logger(label: "markupeditor.mcp.transport", factory: { _ in SwiftLogNoOpLogHandler() })

    private let input: Int32
    private let output: Int32
    private let stream: AsyncThrowingStream<Data, Swift.Error>
    private let continuation: AsyncThrowingStream<Data, Swift.Error>.Continuation
    private var started = false

    init(input: Int32, output: Int32) {
        self.input = input
        self.output = output
        (stream, continuation) = AsyncThrowingStream.makeStream()
    }

    func connect() async throws {
        guard !started else { return }
        started = true
        // If the client closes our output, a write should fail quietly; the loop ends when input closes.
        UnixSocket.suppressSigPipe(output)
        let descriptor = input
        let continuation = continuation
        let reader = Thread {
            var buffer: [UInt8] = []
            while let line = try? UnixSocket.readLine(from: descriptor, buffer: &buffer) {
                if !line.isEmpty { continuation.yield(line) }
            }
            continuation.finish()
        }
        reader.name = "MCPServer.stdin"
        reader.start()
    }

    func disconnect() async {
        continuation.finish()
    }

    func send(_ data: Data) async throws {
        try UnixSocket.writeLine(data, to: output)
    }

    func receive() -> AsyncThrowingStream<Data, Swift.Error> {
        stream
    }
}
