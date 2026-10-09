//
//  ControlDispatcher.swift
//  MarkupEditorAppLib
//

import Foundation

/// Decodes one request line, runs the named tool against the facade, and encodes the reply.
@MainActor
public struct ControlDispatcher {

    private let facade: ControlFacade
    private let tools: [ControlTool]

    /// - Parameter tools: The tools this app answers; reported by `list_tools` so clients advertise only those.
    public init(facade: ControlFacade, tools: [ControlTool] = ControlTools.all) {
        self.facade = facade
        self.tools = tools
    }

    /// Handles one JSON request and returns the JSON reply. A line that can't be decoded gets a
    /// reply with id -1, since the caller's id is unknown.
    public func handle(_ line: Data) async -> Data {
        let response: ControlResponse
        do {
            let request = try JSONDecoder().decode(ControlRequest.self, from: line)
            do {
                response = .success(id: request.id, try await run(request))
            } catch {
                response = .failure(id: request.id, error.localizedDescription)
            }
        } catch {
            response = .failure(id: -1, "Malformed request: \(error.localizedDescription)")
        }
        return (try? JSONEncoder().encode(response)) ?? Data(#"{"id":-1,"ok":false,"error":"Could not encode the reply"}"#.utf8)
    }

    private func run(_ request: ControlRequest) async throws -> JSONValue {
        switch request.tool {
        case ControlTools.listTools:
            return ["tools": .array(tools.map { .string($0.name) })]
        case ControlTools.appState:
            return try await facade.appState()
        case ControlTools.saveDocument:
            try await facade.saveDocument()
            return ["saved": true]
        case ControlTools.runMenuCommand:
            try await facade.runMenuCommand(try argument("name", in: request))
            return ["ran": true]
        case ControlTools.evalJS:
            return try await facade.evalJS(try argument("script", in: request))
        case ControlTools.getMarkdown:
            return .string(try await facade.markdown())
        case ControlTools.getHTML:
            return .string(try await facade.html())
        case ControlTools.typeText:
            try await facade.typeText(try argument("text", in: request))
            return ["typed": true]
        case ControlTools.screenshotEditor:
            return ["png_base64": .string(try await facade.screenshotEditor().base64EncodedString())]
        default:
            throw ControlError("Unknown tool: \(request.tool)")
        }
    }

    private func argument(_ name: String, in request: ControlRequest) throws -> String {
        guard let value = request.args[name]?.stringValue else {
            throw ControlError("\(request.tool) requires a string argument '\(name)'")
        }
        return value
    }
}
