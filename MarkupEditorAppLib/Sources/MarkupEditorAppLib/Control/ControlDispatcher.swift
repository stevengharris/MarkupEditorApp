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
    private let authorizer: ControlAuthorizing
    private let onAuthorizedUse: @MainActor (ClientIdentity?) -> Void

    /// - Parameters:
    ///   - tools: The tools this app answers; anything else is unknown, and `list_tools` reports only these.
    ///   - authorizer: Decides what the requesting client may do.
    ///   - onAuthorizedUse: Told which client is about to use a tool it was allowed to, and not for
    ///     listing tools or for a refused call.
    public init(
        facade: ControlFacade,
        tools: [ControlTool],
        authorizer: ControlAuthorizing,
        onAuthorizedUse: @escaping @MainActor (ClientIdentity?) -> Void = { _ in }
    ) {
        self.facade = facade
        self.tools = tools
        self.authorizer = authorizer
        self.onAuthorizedUse = onAuthorizedUse
    }

#if DEBUG
    /// Tests and Debug tooling: every client is allowed everything.
    public init(facade: ControlFacade, tools: [ControlTool] = ControlTools.all) {
        self.init(facade: facade, tools: tools, authorizer: OpenAuthorizer())
    }
#endif

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
            return await listTools(for: request.client)
        case ControlTools.authorizeOpen:
            try await authorize(requiring: .read, for: request.client)
            onAuthorizedUse(request.client)
            return ["allowed": true, "bundlePath": .string(facade.bundlePath())]
        default:
            break
        }
        guard let tool = tools.first(where: { $0.name == request.tool }) else {
            throw ControlError("Unknown tool: \(request.tool)")
        }
        try await authorize(requiring: tool.access, for: request.client)
        onAuthorizedUse(request.client)
        switch tool.name {
        case ControlTools.getDocument:
            let state = try await facade.appState()
            return [
                "url": state["url"] ?? .null,
                "hasChanges": state["hasChanges"] ?? false,
                "documentType": state["documentType"] ?? .null,
                "markdown": .string(try await facade.markdown()),
            ]
        case ControlTools.getSelection:
            let text = try await facade.selectionText()
            return ["text": .string(text), "isEmpty": .bool(text.isEmpty)]
        case ControlTools.replaceSelection:
            try await facade.typeText(try argument("text", in: request))
            return ["replaced": true]
        default:
            return try await runDeveloperTool(tool.name, request)
        }
    }

    /// Debug builds only: these need the developer facade, which a release build does not have.
    private func runDeveloperTool(_ name: String, _ request: ControlRequest) async throws -> JSONValue {
        guard let developer = facade as? DeveloperControlFacade else {
            throw ControlError("\(name) is not available in this build")
        }
        switch name {
        case ControlTools.appState:
            return try await developer.appState()
        case ControlTools.saveDocument:
            try await developer.saveDocument()
            return ["saved": true]
        case ControlTools.runMenuCommand:
            try await developer.runMenuCommand(try argument("name", in: request))
            return ["ran": true]
        case ControlTools.evalJS:
            return try await developer.evalJS(try argument("script", in: request))
        case ControlTools.getMarkdown:
            return .string(try await developer.markdown())
        case ControlTools.getHTML:
            return .string(try await developer.html())
        case ControlTools.typeText:
            try await developer.typeText(try argument("text", in: request))
            return ["typed": true]
        case ControlTools.screenshotEditor:
            return ["png_base64": .string(try await developer.screenshotEditor().base64EncodedString())]
        default:
            throw ControlError("Unknown tool: \(request.tool)")
        }
    }

    /// The tools to offer this client. Asking never prompts: an undecided client sees every tool,
    /// and the prompt comes with its first call.
    private func listTools(for client: ClientIdentity?) async -> JSONValue {
        let access = await authorizer.access(for: client, prompting: false)
        let offered: [ControlTool]
        switch access {
        case .denied: offered = []
        case .undecided: offered = tools
        case .read, .readWrite: offered = tools.filter { access.permits($0.access) }
        }
        return ["tools": .array(offered.map { .string($0.name) })]
    }

    private func authorize(requiring required: ClientAccess, for client: ClientIdentity?) async throws {
        let access = await authorizer.access(for: client, prompting: true)
        guard access.permits(required) else {
            let name = client?.name ?? "This program"
            if access == .read {
                throw ControlError("\(name) has read-only access to MarkupEditor. Change this in MarkupEditor's settings under Assistants.")
            }
            throw ControlError("\(name) is not allowed to control MarkupEditor. Allow it in MarkupEditor's settings under Assistants.")
        }
    }

    private func argument(_ name: String, in request: ControlRequest) throws -> String {
        guard let value = request.args[name]?.stringValue else {
            throw ControlError("\(request.tool) requires a string argument '\(name)'")
        }
        return value
    }
}
