//
//  MCPControlBackend.swift
//  MarkupEditorAppLib
//

import Foundation
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
    private let nextID = IDCounter()

    public init(send: @escaping Send, open: @escaping OpenFile) {
        self.send = send
        self.open = open
    }

    private static let openTool = ControlTool(
        name: openDocument, title: "Open document", annotations: .additive,
        description: "Open a Markdown or HTML file in MarkupEditor, the same as double-clicking it in Finder. If the file uses local images, MarkupEditor may ask the user to grant access to its folder.",
        inputSchema: ControlTool.schema(["path": ("string", "Absolute path of the file.")], required: ["path"]))

    /// `open_document` always, plus whichever other tools the connected app says it supports. With
    /// no app listening, as in a release build, that is `open_document` alone.
    public func tools() async -> [ControlTool] {
        guard let response = try? await send(ControlRequest(id: nextID.next(), tool: ControlTools.listTools)),
              response.ok, case .array(let items)? = response.result?["tools"] else {
            return [Self.openTool]
        }
        let supported = Set(items.compactMap(\.stringValue))
        return [Self.openTool] + ControlTools.all.filter { supported.contains($0.name) }
    }

    public func call(_ name: String, _ arguments: JSONValue) async -> MCPToolResult {
        if name == Self.openDocument { return await openFile(arguments) }
        do {
            let response = try await send(ControlRequest(id: nextID.next(), tool: name, args: arguments))
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
        do {
            try await open(URL(fileURLWithPath: path), await connectedAppPath())
            return MCPToolResult([.text("Opened \(path)")])
        } catch {
            return .error(error.localizedDescription)
        }
    }

    /// The bundle of the app on the other end of the socket, so a file opens in that copy and not
    /// whichever copy Launch Services prefers. Nil when the app is not reachable.
    private func connectedAppPath() async -> String? {
        guard let response = try? await send(ControlRequest(id: nextID.next(), tool: ControlTools.appState)), response.ok else { return nil }
        return response.result?["bundlePath"]?.stringValue
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

private final class IDCounter: Sendable {
    private let value = Mutex<Int>(0)
    func next() -> Int { value.withLock { $0 += 1; return $0 } }
}
