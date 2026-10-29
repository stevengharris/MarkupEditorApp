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
    var replaceResult = ReplaceResult(ok: true, range: .init(index: 1, count: 1), blocks: [ContentBlock(index: 1, kind: "paragraph", hash: "h2", markdown: "new")])
    var selectResult = SelectionResult(found: true, blockIndex: 2)
    var proposeResult = ProposeResult(ok: true, results: [ProposeOutcome(index: 0, status: "proposed", id: "s1", block: 1), ProposeOutcome(index: 1, status: "refused", reason: "find not found in block 1")])
    var suggestionList = SuggestionList(ok: true, suggestions: [Suggestion(id: "s1", status: "pending", block: 1, find: "cat", replace: "dog", note: "prefer dogs")])

    private func record(_ call: String) throws {
        calls.append(call)
        if let failure { throw failure }
    }

    func documentContent(format: ContentFormat, from: Int?, limit: Int?) async throws -> DocumentContent {
        try record("documentContent:\(format.rawValue):\(from.map(String.init) ?? "-"):\(limit.map(String.init) ?? "-")")
        return DocumentContent(view: "editor", hasChanges: true, blocks: [ContentBlock(index: 0, kind: "heading", hash: "h1", markdown: "# Title")], firstEditable: 0)
    }
    func selectionContent() async throws -> SelectionContent {
        try record("selectionContent")
        return SelectionContent(text: "chosen words", blockIndex: 0, block: ContentBlock(index: 0, kind: "heading", hash: "h1", markdown: "# Title"), state: ["canUndo": true])
    }
    func select(_ target: SelectionTarget) async throws -> SelectionResult { try record("select:\(target)"); return selectResult }
    func replaceBlocks(index: Int, count: Int, markdown: String, expected: [String], allowLoss: Bool) async throws -> ReplaceResult {
        try record("replaceBlocks:\(index):\(count):\(markdown):\(expected.joined(separator: ",")):\(allowLoss)")
        return replaceResult
    }
    func proposeEdits(_ edits: [SuggestedEdit]) async throws -> ProposeResult {
        try record("proposeEdits:" + edits.map { "\($0.block)/\($0.expected)/\($0.find)/\($0.replace)/\($0.note ?? "-")" }.joined(separator: ","))
        return proposeResult
    }
    func listSuggestions() async throws -> SuggestionList { try record("listSuggestions"); return suggestionList }
    func undo() async throws { try record("undo") }
    func redo() async throws { try record("redo") }
    func saveDocument() async throws -> URL { try record("saveDocument"); return URL(fileURLWithPath: "/tmp/doc.md") }
    func appState() async throws -> JSONValue { try record("appState"); return ["hasChanges": true] }
    func runMenuCommand(_ name: String) async throws { try record("runMenuCommand:\(name)") }
    func evalJS(_ script: String) async throws -> JSONValue { try record("evalJS:\(script)"); return .number(42) }
    func markdown() async throws -> String { try record("markdown"); return "# Title" }
    func html() async throws -> String { try record("html"); return "<h1>Title</h1>" }
    func typeText(_ text: String) async throws { try record("typeText:\(text)") }
    func screenshotEditor() async throws -> Data { try record("screenshotEditor"); return Data([1, 2, 3]) }
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
        #expect(readOnly == ["app_state", "get_markdown", "get_html", "screenshot_editor", "get_document", "get_selection", "list_suggestions"])
        #expect(ControlTools.named("propose_edits")?.annotations == .additive)
        #expect(ControlTools.named("save_document")?.annotations.destructive == true)
        #expect(ControlTools.named("eval_js")?.annotations.destructive == true)
        #expect(ControlTools.named("type_text")?.annotations == .additive)
    }

    @Test func everyListedToolIsDispatchable() async throws {
        for tool in ControlTools.all {
            let response = try await send(tool.name, Self.sampleArguments(for: tool))
            #expect(response.ok, "\(tool.name) should dispatch")
        }
    }

    /// Arguments that satisfy the tool's schema: a value of the right type for each required property.
    static func sampleArguments(for tool: ControlTool) -> JSONValue {
        if tool.name == "select" { return ["block": 0] }
        if tool.name == "propose_edits" { return ["edits": [["block": 0, "expected": "x", "find": "x", "replace": "y"]]] }
        var args: [String: JSONValue] = [:]
        guard case .array(let required)? = tool.inputSchema["required"] else { return .object(args) }
        for name in required.compactMap(\.stringValue) {
            switch tool.inputSchema["properties"]?[name]?["type"]?.stringValue {
            case "integer": args[name] = 0
            case "boolean": args[name] = false
            case "array": args[name] = []
            default: args[name] = "x"
            }
        }
        return .object(args)
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
            let readsOnly = tool.annotations.readOnly || tool.name == "select"   // select only moves the visible selection
            #expect(tool.access == (readsOnly ? .read : .readWrite), "\(tool.name)")
        }
    }

    @Test func theEndUserSetIsExactlyTheDocumentTools() {
        #expect(ControlTools.endUser.map(\.name) == ["get_document", "get_selection", "select", "replace_blocks", "propose_edits", "list_suggestions", "undo", "redo", "save_document"])
        #expect(ControlTools.endUser.allSatisfy { $0.scope == .endUser })
        #expect(ControlTools.developer.allSatisfy { $0.scope == .developer })
        #expect(ControlTools.all.count == ControlTools.endUser.count + ControlTools.developer.count)
    }

    @Test func noEndUserToolReachesBeyondTheDocument() {
        let reachingTools: Set<String> = ["eval_js", "run_menu_command", "screenshot_editor", "app_state", "type_text"]
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

    @Test func onlyAuthorizedUseIsReportedAsActivity() async throws {
        var used: [String?] = []
        func run(_ tool: String, access: ClientAccess) async throws {
            let dispatcher = ControlDispatcher(facade: facade, tools: ControlTools.all, authorizer: FakeAuthorizer(access), onAuthorizedUse: { used.append($0?.name) })
            let request = ControlRequest(id: 1, tool: tool, args: ["text": "x"], client: claude)
            _ = await dispatcher.handle(try JSONEncoder().encode(request))
        }

        try await run("list_tools", access: .readWrite)
        try await run("get_selection", access: .denied)
        try await run("replace_blocks", access: .read)
        #expect(used.isEmpty)

        try await run("get_selection", access: .read)
        try await run("authorize_open", access: .read)
        #expect(used == ["Claude", "Claude"])
    }

    @Test func getDocumentReturnsTheBlocksAndTheViewState() async throws {
        let response = try await send("get_document", ["from": 2, "limit": 100], access: .read)
        #expect(response.ok)
        #expect(response.result?["view"] == "editor")
        #expect(response.result?["hasChanges"] == true)
        #expect(response.result?["firstEditable"] == 0)
        #expect(response.result?["blocks"] == [["index": 0, "kind": "heading", "hash": "h1", "markdown": "# Title", "warnings": []]])
        #expect(response.result?["next"] == nil)
        #expect(facade.calls == ["documentContent:markdown:2:100"])
    }

    @Test func getDocumentPassesTheFormatThrough() async throws {
        _ = try await send("get_document", ["format": "html"], access: .read)
        #expect(facade.calls == ["documentContent:html:-:-"])
    }

    @Test func getSelectionReturnsTheSelectionAndItsBlock() async throws {
        let response = try await send("get_selection", access: .read)
        #expect(response.result?["text"] == "chosen words")
        #expect(response.result?["blockIndex"] == 0)
        #expect(response.result?["block"]?["hash"] == "h1")
        #expect(response.result?["state"] == ["canUndo": true])
    }

    @Test func selectReachesTheFacadeWithItsTarget() async throws {
        let byBlock = try await send("select", ["block": 3], access: .read)
        #expect(byBlock.result == ["found": true, "blockIndex": 2])
        _ = try await send("select", ["text": "cat", "occurrence": 2], access: .read)
        #expect(facade.calls == ["select:block(3)", "select:text(\"cat\", occurrence: 2)"])
    }

    @Test func replaceBlocksReachesTheFacadeAndReturnsItsResult() async throws {
        let args: JSONValue = ["index": 1, "count": 1, "markdown": "new", "expected": ["h2"], "allowLoss": true]
        let response = try await send("replace_blocks", args, access: .readWrite)
        #expect(response.result?["ok"] == true)
        #expect(response.result?["range"] == ["index": 1, "count": 1])
        #expect(response.result?["blocks"] == [["index": 1, "kind": "paragraph", "hash": "h2", "markdown": "new", "warnings": []]])
        #expect(facade.calls == ["replaceBlocks:1:1:new:h2:true"])
    }

    @Test func aRefusedReplaceIsAReplyWithTheCurrentBlocksNotAnError() async throws {
        facade.replaceResult = ReplaceResult(ok: false, reason: "The document changed since it was read", blocks: [ContentBlock(index: 1, kind: "paragraph", hash: "now", markdown: "changed")])
        let response = try await send("replace_blocks", ["index": 1, "count": 1, "markdown": "x", "expected": ["old"]], access: .readWrite)
        #expect(response.ok)
        #expect(response.result?["ok"] == false)
        #expect(response.result?["reason"] == "The document changed since it was read")
        guard case .array(let blocks)? = response.result?["blocks"] else { Issue.record("no blocks"); return }
        #expect(blocks.first?["hash"] == "now")
    }

    @Test func proposeEditsReachesTheFacadeAndReturnsItsResult() async throws {
        let args: JSONValue = ["edits": [
            ["block": 1, "expected": "h2", "find": "cat", "replace": "dog", "note": "why"],
            ["block": 1, "expected": "h2", "find": "mat", "replace": ""],
        ]]
        let response = try await send("propose_edits", args, access: .readWrite)
        #expect(response.ok)
        #expect(response.result == [
            "ok": true,
            "results": [
                ["index": 0, "status": "proposed", "id": "s1", "block": 1],
                ["index": 1, "status": "refused", "reason": "find not found in block 1"],
            ],
        ])
        #expect(facade.calls == ["proposeEdits:1/h2/cat/dog/why,1/h2/mat//-"])
    }

    @Test func aWholeCallRefusalFromProposeEditsIsAReplyNotAnError() async throws {
        facade.proposeResult = ProposeResult(ok: false, reason: "No active view")
        let response = try await send("propose_edits", ["edits": [["block": 0, "expected": "h", "find": "x", "replace": "y"]]], access: .readWrite)
        #expect(response.ok)
        #expect(response.result == ["ok": false, "reason": "No active view", "results": []])
    }

    @Test func listSuggestionsReachesTheFacadeAndReturnsItsList() async throws {
        let response = try await send("list_suggestions", access: .read)
        #expect(response.result == [
            "ok": true,
            "suggestions": [["id": "s1", "status": "pending", "block": 1, "find": "cat", "replace": "dog", "note": "prefer dogs"]],
        ])
        #expect(facade.calls == ["listSuggestions"])
    }

    @Test func undoRedoAndSaveReachTheFacade() async throws {
        #expect(try await send("undo", access: .readWrite).result == ["undone": true])
        #expect(try await send("redo", access: .readWrite).result == ["redone": true])
        #expect(try await send("save_document", access: .readWrite).result == ["saved": true, "url": "file:///tmp/doc.md"])
        #expect(facade.calls == ["undo", "redo", "saveDocument"])
    }

    @Test func invalidArgumentsNeverReachTheFacade() async throws {
        let bad: [(String, JSONValue)] = [
            ("get_document", ["from": -1]),
            ("get_document", ["format": "pdf"]),
            ("select", [:]),
            ("select", ["block": 1, "text": "x"]),
            ("replace_blocks", ["index": 0, "count": 1, "markdown": "x"]),
            ("replace_blocks", ["index": -1, "count": 1, "markdown": "x", "expected": ["h"]]),
            ("replace_blocks", ["index": 0, "count": 1.5, "markdown": "x", "expected": ["h"]]),
            ("replace_blocks", ["index": 0, "count": 1, "markdown": "x", "expected": "h"]),
            ("replace_blocks", ["index": 0, "count": 1, "markdown": "x", "expected": ["h"], "allowLoss": "yes"]),
            ("propose_edits", [:]),
            ("propose_edits", ["edits": []]),
            ("propose_edits", ["edits": [["block": 0, "expected": "h", "find": "", "replace": "y"]]]),
            ("propose_edits", ["edits": [["block": 0, "expected": "h", "find": "x"]]]),
        ]
        for (tool, args) in bad {
            let response = try await send(tool, args, access: .readWrite)
            #expect(!response.ok, "\(tool) \(args)")
            #expect(response.error?.hasPrefix("\(tool):") == true, "\(tool): \(response.error ?? "")")
        }
        #expect(facade.calls.isEmpty)
    }

    @Test func aDeniedClientCannotCallAnything() async throws {
        let response = try await send("get_document", access: .denied)
        #expect(!response.ok)
        #expect(response.error?.contains("Claude is not allowed to control MarkupEditor") == true)
        #expect(facade.calls.isEmpty)
    }

    @Test func aReadOnlyClientCanReadAndShowButNotChange() async throws {
        #expect(try await send("get_document", access: .read).ok)
        #expect(try await send("get_selection", access: .read).ok)
        #expect(try await send("select", ["block": 0], access: .read).ok)
        #expect(try await send("list_suggestions", access: .read).ok)
        let writes: [(String, JSONValue)] = [
            ("replace_blocks", ["index": 0, "count": 1, "markdown": "x", "expected": ["h"]]),
            ("propose_edits", ["edits": [["block": 0, "expected": "h", "find": "x", "replace": "y"]]]),
            ("undo", [:]), ("redo", [:]), ("save_document", [:]),
        ]
        for (tool, args) in writes {
            let refused = try await send(tool, args, access: .read)
            #expect(!refused.ok, Comment(rawValue: tool))
            #expect(refused.error?.contains("read-only access") == true, Comment(rawValue: tool))
        }
        #expect(facade.calls == ["documentContent:markdown:-:-", "selectionContent", "select:block(0)", "listSuggestions"])
    }

    @Test func aReadWriteClientCanChange() async throws {
        let args: JSONValue = ["index": 0, "count": 1, "markdown": "x", "expected": ["h"]]
        #expect(try await send("replace_blocks", args, access: .readWrite).ok)
    }

    @Test func aDeniedClientCannotWriteOrSave() async throws {
        for tool in ["undo", "redo", "save_document"] {
            #expect(try await send(tool, access: .denied).ok == false, Comment(rawValue: tool))
        }
        #expect(facade.calls.isEmpty)
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
        for name in ["eval_js", "run_menu_command", "app_state", "screenshot_editor", "get_html", "type_text", "get_markdown"] {
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
        #expect(try await listed(.undecided) == ["get_document", "get_selection", "select", "replace_blocks", "propose_edits", "list_suggestions", "undo", "redo", "save_document"])
        #expect(try await listed(.denied) == [])
    }

    @Test func listingOffersOnlyReadToolsToAReadOnlyClient() async throws {
        #expect(try await listed(.read) == ["get_document", "get_selection", "select", "list_suggestions"])
        #expect(try await listed(.readWrite) == ["get_document", "get_selection", "select", "replace_blocks", "propose_edits", "list_suggestions", "undo", "redo", "save_document"])
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
    func documentContent(format: ContentFormat, from: Int?, limit: Int?) async throws -> DocumentContent { calls.append("documentContent"); return DocumentContent(view: "editor", hasChanges: false) }
    func selectionContent() async throws -> SelectionContent { calls.append("selectionContent"); return SelectionContent(text: "") }
    func select(_ target: SelectionTarget) async throws -> SelectionResult { calls.append("select"); return SelectionResult(found: false) }
    func replaceBlocks(index: Int, count: Int, markdown: String, expected: [String], allowLoss: Bool) async throws -> ReplaceResult { calls.append("replaceBlocks"); return ReplaceResult(ok: true) }
    func proposeEdits(_ edits: [SuggestedEdit]) async throws -> ProposeResult { calls.append("proposeEdits"); return ProposeResult(ok: true) }
    func listSuggestions() async throws -> SuggestionList { calls.append("listSuggestions"); return SuggestionList(ok: true) }
    func undo() async throws { calls.append("undo") }
    func redo() async throws { calls.append("redo") }
    func saveDocument() async throws -> URL { calls.append("saveDocument"); return URL(fileURLWithPath: "/tmp/x.md") }
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

    @Test func appStateNeedsTheDeveloperFacade() async throws {
        let facade = EndUserOnlyFacade()
        let dispatcher = ControlDispatcher(facade: facade, tools: ControlTools.all)
        let line = try JSONEncoder().encode(ControlRequest(id: 1, tool: "app_state"))
        let response = try JSONDecoder().decode(ControlResponse.self, from: await dispatcher.handle(line))
        #expect(response == .failure(id: 1, "app_state is not available in this build"))
        #expect(facade.calls.isEmpty)
    }

    @Test func endUserToolsStillWorkWithAReleaseFacade() async throws {
        let facade = EndUserOnlyFacade()
        let dispatcher = ControlDispatcher(facade: facade, tools: ControlTools.endUser)
        let line = try JSONEncoder().encode(ControlRequest(id: 2, tool: "get_selection"))
        let response = try JSONDecoder().decode(ControlResponse.self, from: await dispatcher.handle(line))
        #expect(response.result?["text"] == "")
        #expect(facade.calls == ["selectionContent"])
    }
}
