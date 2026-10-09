//
//  ControlDispatcherTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

@MainActor
final class FakeControlFacade: DeveloperControlFacade {
    var calls: [String] = []
    var failure: ControlError?

    private func record(_ call: String) throws {
        calls.append(call)
        if let failure { throw failure }
    }

    func appState() async throws -> JSONValue { try record("appState"); return ["hasChanges": true] }
    func saveDocument() async throws { try record("saveDocument") }
    func runMenuCommand(_ name: String) async throws { try record("runMenuCommand:\(name)") }
    func evalJS(_ script: String) async throws -> JSONValue { try record("evalJS:\(script)"); return .number(42) }
    func markdown() async throws -> String { try record("markdown"); return "# Title" }
    func html() async throws -> String { try record("html"); return "<h1>Title</h1>" }
    func typeText(_ text: String) async throws { try record("typeText:\(text)") }
    func screenshotEditor() async throws -> Data { try record("screenshotEditor"); return Data([1, 2, 3]) }
    func selectionText() async throws -> String { try record("selectionText"); return "chosen words" }
    func bundlePath() -> String { "/Applications/MarkupEditor.app" }
}

@MainActor
struct ControlDispatcherTests {

    let facade = FakeControlFacade()

    func send(_ tool: String, _ args: JSONValue = [:], id: Int = 7) async throws -> ControlResponse {
        let line = try JSONEncoder().encode(ControlRequest(id: id, tool: tool, args: args))
        let reply = await ControlDispatcher(facade: facade).handle(line)
        return try JSONDecoder().decode(ControlResponse.self, from: reply)
    }

    @Test func appStateReturnsTheFacadeState() async throws {
        let response = try await send("app_state")
        #expect(response == .success(id: 7, ["hasChanges": true]))
    }

    @Test func eachToolReachesItsFacadeMethod() async throws {
        _ = try await send("save_document")
        _ = try await send("run_menu_command", ["name": "toggleSource"])
        _ = try await send("eval_js", ["script": "1+1"])
        _ = try await send("get_markdown")
        _ = try await send("get_html")
        _ = try await send("type_text", ["text": "hi"])
        _ = try await send("screenshot_editor")
        #expect(facade.calls == ["saveDocument", "runMenuCommand:toggleSource", "evalJS:1+1", "markdown", "html", "typeText:hi", "screenshotEditor"])
    }

    @Test func resultsAreShapedForTheirTool() async throws {
        #expect(try await send("eval_js", ["script": "x"]).result == .number(42))
        #expect(try await send("get_markdown").result == "# Title")
        #expect(try await send("screenshot_editor").result == ["png_base64": .string(Data([1, 2, 3]).base64EncodedString())])
    }

    @Test func theReplyCarriesTheRequestId() async throws {
        #expect(try await send("save_document", id: 99).id == 99)
    }

    @Test func aMissingArgumentIsReportedAndNothingRuns() async throws {
        let response = try await send("eval_js", [:])
        #expect(!response.ok)
        #expect(response.error == "eval_js requires a string argument 'script'")
        #expect(facade.calls.isEmpty)
    }

    @Test func aNonStringArgumentIsRejected() async throws {
        let response = try await send("type_text", ["text": 5])
        #expect(!response.ok)
        #expect(facade.calls.isEmpty)
    }

    @Test func anUnknownToolIsReported() async throws {
        let response = try await send("delete_everything")
        #expect(response == .failure(id: 7, "Unknown tool: delete_everything"))
    }

    @Test func aFacadeErrorBecomesAFailureReply() async throws {
        facade.failure = ControlError("no web view")
        let response = try await send("get_html")
        #expect(response == .failure(id: 7, "no web view"))
    }

    @Test func aMalformedLineGetsAFailureReply() async throws {
        let reply = await ControlDispatcher(facade: facade).handle(Data("not json".utf8))
        let response = try JSONDecoder().decode(ControlResponse.self, from: reply)
        #expect(!response.ok)
        #expect(response.id == -1)
        #expect(facade.calls.isEmpty)
    }

    @Test func listToolsReportsTheNamesTheAppSupports() async throws {
        let response = try await send("list_tools")
        #expect(response.result == ["tools": .array(ControlTools.all.map { .string($0.name) })])
        #expect(facade.calls.isEmpty)
    }

    @Test func listToolsReportsOnlyTheToolsItWasGiven() async throws {
        let subset = ControlDispatcher(facade: facade, tools: [ControlTools.all[0]])
        let reply = await subset.handle(try JSONEncoder().encode(ControlRequest(id: 1, tool: "list_tools")))
        let response = try JSONDecoder().decode(ControlResponse.self, from: reply)
        #expect(response.result == ["tools": [.string(ControlTools.all[0].name)]])
    }

    @Test func everyToolHasATitleAndSaneAnnotations() {
        for tool in ControlTools.all {
            #expect(!tool.title.isEmpty, "\(tool.name) needs a title")
            #expect(!(tool.annotations.readOnly && tool.annotations.destructive), "\(tool.name) cannot be both")
        }
    }

    @Test func theToolsThatOnlyReadAreMarkedReadOnly() {
        let readOnly = Set(ControlTools.all.filter(\.annotations.readOnly).map(\.name))
        #expect(readOnly == ["app_state", "get_markdown", "get_html", "screenshot_editor", "get_document", "get_selection"])
        #expect(ControlTools.named("save_document")?.annotations.destructive == true)
        #expect(ControlTools.named("eval_js")?.annotations.destructive == true)
        #expect(ControlTools.named("type_text")?.annotations == .additive)
    }

    @Test func everyListedToolIsDispatchable() async throws {
        for tool in ControlTools.all {
            var args: [String: JSONValue] = [:]
            for key in tool.inputSchema["required"].map({ value -> [String] in
                if case .array(let items) = value { return items.compactMap(\.stringValue) } else { return [] }
            }) ?? [] { args[key] = "x" }
            let response = try await send(tool.name, .object(args))
            #expect(response.ok, "\(tool.name) should dispatch")
        }
    }
}

// MARK: Tool catalog

struct ControlToolsCatalogTests {

    @Test func toolNamesAreUnique() {
        let names = ControlTools.all.map(\.name)
        #expect(Set(names).count == names.count)
    }

    @Test func readOnlyToolsNeedReadAndAllOthersNeedWrite() {
        for tool in ControlTools.all {
            #expect(tool.access == (tool.annotations.readOnly ? .read : .readWrite), "\(tool.name)")
        }
    }

    @Test func theEndUserSetIsExactlyTheDocumentTools() {
        #expect(ControlTools.endUser.map(\.name) == ["get_document", "get_selection", "replace_selection"])
        #expect(ControlTools.endUser.allSatisfy { $0.scope == .endUser })
        #expect(ControlTools.developer.allSatisfy { $0.scope == .developer })
        #expect(ControlTools.all.count == ControlTools.endUser.count + ControlTools.developer.count)
    }

    @Test func noEndUserToolReachesBeyondTheDocument() {
        let reachingTools: Set<String> = ["eval_js", "run_menu_command", "save_document", "screenshot_editor", "app_state"]
        #expect(Set(ControlTools.endUser.map(\.name)).isDisjoint(with: reachingTools))
    }
}

// MARK: Access gating

@MainActor
final class FakeAuthorizer: ControlAuthorizing {
    var answer: ClientAccess
    var asked: [(client: String?, prompting: Bool)] = []
    init(_ answer: ClientAccess) { self.answer = answer }
    func access(for client: ClientIdentity?, prompting: Bool) async -> ClientAccess {
        asked.append((client?.name, prompting))
        return answer
    }
}

@MainActor
struct ControlDispatcherAccessTests {

    let facade = FakeControlFacade()
    let claude = ClientIdentity(name: "Claude", path: "/A/Claude.app", bundleIdentifier: "com.anthropic.claude")

    func send(_ tool: String, _ args: JSONValue = [:], access: ClientAccess, tools: [ControlTool] = ControlTools.all,
              client: ClientIdentity? = nil, authorizer: FakeAuthorizer? = nil) async throws -> ControlResponse {
        let authorizer = authorizer ?? FakeAuthorizer(access)
        let dispatcher = ControlDispatcher(facade: facade, tools: tools, authorizer: authorizer)
        let request = ControlRequest(id: 1, tool: tool, args: args, client: client ?? claude)
        let reply = await dispatcher.handle(try JSONEncoder().encode(request))
        return try JSONDecoder().decode(ControlResponse.self, from: reply)
    }

    @Test func getDocumentReturnsTheStateAndTheLiveMarkdown() async throws {
        let response = try await send("get_document", access: .read)
        #expect(response.ok)
        #expect(response.result?["markdown"] == "# Title")
        #expect(response.result?["hasChanges"] == true)
        #expect(response.result?["url"] == .null)
        #expect(response.result?["windows"] == nil)
    }

    @Test func getSelectionReturnsTheSelectedText() async throws {
        let response = try await send("get_selection", access: .read)
        #expect(response.result == ["text": "chosen words", "isEmpty": false])
    }

    @Test func replaceSelectionInsertsThroughTheEditor() async throws {
        let response = try await send("replace_selection", ["text": "new"], access: .readWrite)
        #expect(response.result == ["replaced": true])
        #expect(facade.calls == ["typeText:new"])
    }

    @Test func aDeniedClientCannotCallAnything() async throws {
        let response = try await send("get_document", access: .denied)
        #expect(!response.ok)
        #expect(response.error?.contains("Claude is not allowed to control MarkupEditor") == true)
        #expect(facade.calls.isEmpty)
    }

    @Test func aReadOnlyClientCanReadButNotChange() async throws {
        #expect(try await send("get_document", access: .read).ok)
        let refused = try await send("replace_selection", ["text": "x"], access: .read)
        #expect(!refused.ok)
        #expect(refused.error?.contains("read-only access") == true)
        #expect(facade.calls == ["appState", "markdown"])
    }

    @Test func aReadWriteClientCanChange() async throws {
        #expect(try await send("replace_selection", ["text": "x"], access: .readWrite).ok)
    }

    @Test func callingAToolPromptsButAnUnknownToolDoesNot() async throws {
        let authorizer = FakeAuthorizer(.readWrite)
        _ = try await send("get_selection", access: .readWrite, authorizer: authorizer)
        _ = try await send("delete_everything", access: .readWrite, authorizer: authorizer)
        #expect(authorizer.asked.count == 1)
        #expect(authorizer.asked.first?.prompting == true)
        #expect(authorizer.asked.first?.client == "Claude")
    }

    @Test func theClientIdentityReachesTheAuthorizer() async throws {
        let authorizer = FakeAuthorizer(.read)
        _ = try await send("get_selection", access: .read, client: ClientIdentity(name: "node", path: "/usr/bin/node"), authorizer: authorizer)
        #expect(authorizer.asked.first?.client == "node")
    }

    @Test func developerToolsAreUnknownInAnEndUserBuildEvenForAFullAccessClient() async throws {
        for name in ["eval_js", "save_document", "run_menu_command", "app_state", "screenshot_editor", "get_html"] {
            let response = try await send(name, ["script": "1", "name": "save"], access: .readWrite, tools: ControlTools.endUser)
            #expect(response == .failure(id: 1, "Unknown tool: \(name)"), "\(name)")
        }
        #expect(facade.calls.isEmpty)
    }

    // MARK: list_tools and authorize_open

    func listed(_ access: ClientAccess, tools: [ControlTool] = ControlTools.endUser) async throws -> [String]? {
        let authorizer = FakeAuthorizer(access)
        let response = try await send("list_tools", access: access, tools: tools, authorizer: authorizer)
        #expect(authorizer.asked.allSatisfy { !$0.prompting }, "listing must never prompt")
        guard case .array(let names)? = response.result?["tools"] else { return nil }
        return names.compactMap(\.stringValue)
    }

    @Test func listingOffersEverythingBeforeADecisionAndNothingWhenDenied() async throws {
        #expect(try await listed(.undecided) == ["get_document", "get_selection", "replace_selection"])
        #expect(try await listed(.denied) == [])
    }

    @Test func listingOffersOnlyReadToolsToAReadOnlyClient() async throws {
        #expect(try await listed(.read) == ["get_document", "get_selection"])
        #expect(try await listed(.readWrite) == ["get_document", "get_selection", "replace_selection"])
    }

    @Test func authorizeOpenAllowsAReadClientAndReportsTheAppBundle() async throws {
        let response = try await send("authorize_open", access: .read)
        #expect(response.result == ["allowed": true, "bundlePath": "/Applications/MarkupEditor.app"])
    }

    @Test func authorizeOpenPromptsAndRefusesADeniedClient() async throws {
        let authorizer = FakeAuthorizer(.denied)
        let response = try await send("authorize_open", access: .denied, authorizer: authorizer)
        #expect(!response.ok)
        #expect(authorizer.asked.first?.prompting == true)
    }
}

/// A facade as a release build has it: the end-user operations and nothing more.
@MainActor
final class EndUserOnlyFacade: ControlFacade {
    var calls: [String] = []
    func appState() async throws -> JSONValue { calls.append("appState"); return ["hasChanges": false] }
    func markdown() async throws -> String { calls.append("markdown"); return "text" }
    func typeText(_ text: String) async throws { calls.append("typeText") }
    func selectionText() async throws -> String { calls.append("selectionText"); return "" }
    func bundlePath() -> String { "/Applications/MarkupEditor.app" }
}

@MainActor
struct ControlDispatcherReleaseFacadeTests {

    @Test func aFacadeWithoutDeveloperSupportRefusesDeveloperToolsEvenIfTheyAreOffered() async throws {
        let facade = EndUserOnlyFacade()
        let dispatcher = ControlDispatcher(facade: facade, tools: ControlTools.all)
        let line = try JSONEncoder().encode(ControlRequest(id: 1, tool: "eval_js", args: ["script": "1"]))
        let response = try JSONDecoder().decode(ControlResponse.self, from: await dispatcher.handle(line))
        #expect(response == .failure(id: 1, "eval_js is not available in this build"))
        #expect(facade.calls.isEmpty)
    }

    @Test func endUserToolsStillWorkWithAReleaseFacade() async throws {
        let facade = EndUserOnlyFacade()
        let dispatcher = ControlDispatcher(facade: facade, tools: ControlTools.endUser)
        let line = try JSONEncoder().encode(ControlRequest(id: 2, tool: "get_selection"))
        let response = try JSONDecoder().decode(ControlResponse.self, from: await dispatcher.handle(line))
        #expect(response.result == ["text": "", "isEmpty": true])
    }
}
