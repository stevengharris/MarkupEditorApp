//
//  ControlDispatcherTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

@MainActor
final class FakeControlFacade: ControlFacade {
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
        #expect(readOnly == ["app_state", "get_markdown", "get_html", "screenshot_editor"])
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
