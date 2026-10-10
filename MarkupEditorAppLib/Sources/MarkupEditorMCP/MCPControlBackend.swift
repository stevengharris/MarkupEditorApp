//
//  MCPControlBackend.swift
//  MarkupEditorMCP
//

import Foundation
import MarkupEditorAppLib
import Synchronization

/// Connects MCP tool calls to the app: control-channel tools go over the socket, and
/// `open_document` runs here because only a process outside the sandbox can hand the app a file.
public struct MCPControlBackend: Sendable {

    public static let openDocument = "open_document"

    public typealias Send = @Sendable (ControlRequest) async throws -> ControlResponse
    /// Opens a file, in the app at `appPath` when the connected app reported one, else in the default app.
    public typealias OpenFile = @Sendable (_ file: URL, _ appPath: String?) async throws -> Void

    private let send: Send
    private let open: OpenFile
    private let client: ClientIdentity?
    private let rawLog: @Sendable (String) -> Void
    private let nextID = IDCounter()
    private let lastLogged = LastMessage()

    /// - Parameter client: The program running this server, attached to every request so the app can
    ///   decide what it may do.
    ///   - log: Told why the app could not be used, for the server's stderr; MCP clients keep it.
    public init(client: ClientIdentity? = nil, log: @escaping @Sendable (String) -> Void = { _ in }, send: @escaping Send, open: @escaping OpenFile) {
        self.client = client
        self.rawLog = log
        self.send = send
        self.open = open
    }

    /// Tools are listed every few seconds, so a message is logged only when it changes.
    private func log(_ message: String) {
        if lastLogged.changes(to: message) { rawLog(message) }
    }

    private func request(_ tool: String, _ args: JSONValue = [:]) -> ControlRequest {
        ControlRequest(id: nextID.next(), tool: tool, args: args, client: client)
    }

    private static let openTool = ControlTool(
        name: openDocument, title: "Open document", scope: .endUser, access: .read, annotations: .additive,
        description: "Open a Markdown or HTML file in MarkupEditor, the same as double-clicking it in Finder. Requires MarkupEditor to be running with Assistants turned on and this program allowed. If the file uses local images, MarkupEditor may ask the user to grant access to its folder. If the open document has unsaved changes, MarkupEditor asks the user whether to save them first.",
        inputSchema: ControlTool.schema(["path": ("string", "Absolute path of the file.")], required: ["path"]))

    /// Every tool name a client may call, offered or not.
    public static var knownToolNames: Set<String> {
        Set([openDocument] + ControlTools.all.map(\.name))
    }

    /// `open_document` always, plus whichever other tools the connected app says it supports. With
    /// no app listening, that is `open_document` alone, which then reports that the app did not answer.
    public func tools() async -> [ControlTool] {
        do {
            let response = try await send(request(ControlTools.listTools))
            guard response.ok, case .array(let items)? = response.result?["tools"] else {
                log("MarkupEditor did not offer its tools: \(response.error ?? "unexpected reply")")
                return [Self.openTool]
            }
            let supported = Set(items.compactMap(\.stringValue))
            return [Self.openTool] + ControlTools.all.filter { supported.contains($0.name) }
        } catch {
            log("MarkupEditor is not reachable: \(error.localizedDescription)")
            return [Self.openTool]
        }
    }

    public func call(_ name: String, _ arguments: JSONValue) async -> MCPToolResult {
        if name == Self.openDocument { return await openFile(arguments) }
        do {
            let response = try await send(request(name, arguments))
            guard response.ok, let result = response.result else {
                return .error(response.error ?? "The app reported an error")
            }
            return Self.content(for: name, result)
        } catch {
            return .error(error.localizedDescription)
        }
    }

    private func openFile(_ arguments: JSONValue) async -> MCPToolResult {
        guard let path = arguments["path"]?.stringValue else { return .error("open_document requires a string argument 'path'") }
        guard FileManager.default.fileExists(atPath: path) else { return .error("No such file: \(path)") }
        let appPath: String?
        switch await authorizeOpen() {
        case .refused(let message): return .error(message)
        case .allowed(let bundlePath): appPath = bundlePath
        }
        do {
            try await open(URL(fileURLWithPath: path), appPath)
            return MCPToolResult([.text("Opened \(path)")])
        } catch {
            return .error(error.localizedDescription)
        }
    }

    private enum OpenDecision {
        case allowed(bundlePath: String?)
        case refused(String)
    }

    /// Asks the connected app whether this client may open files, and which copy of the app to open
    /// them in, so a file opens in the app that answered and not whichever copy Launch Services
    /// prefers. An app that cannot be reached, or has Assistants turned off, does not allow it.
    private func authorizeOpen() async -> OpenDecision {
        do {
            let response = try await send(request(ControlTools.authorizeOpen))
            guard response.ok else { return .refused(response.error ?? "MarkupEditor did not allow opening files") }
            return .allowed(bundlePath: response.result?["bundlePath"]?.stringValue)
        } catch {
            return .refused("MarkupEditor did not answer, so the file was not opened. Make sure MarkupEditor is running with Assistants turned on in its settings. (\(error.localizedDescription))")
        }
    }

    static func content(for tool: String, _ result: JSONValue) -> MCPToolResult {
        if tool == ControlTools.screenshotEditor, let png = result["png_base64"]?.stringValue {
            return MCPToolResult([.image(base64: png, mimeType: "image/png")])
        }
        if let text = result.stringValue { return MCPToolResult([.text(text)]) }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let text = (try? encoder.encode(result)).flatMap { String(data: $0, encoding: .utf8) } ?? "null"
        return MCPToolResult([.text(text)])
    }
}

private final class LastMessage: Sendable {
    private let value = Mutex<String?>(nil)
    func changes(to message: String) -> Bool {
        value.withLock { last in
            defer { last = message }
            return last != message
        }
    }
}

private final class IDCounter: Sendable {
    private let value = Mutex<Int>(0)
    func next() -> Int { value.withLock { $0 += 1; return $0 } }
}
