//
//  MCPControlBackendTests.swift
//  MarkupEditorMCPTests
//

import Foundation
import Testing
import MarkupEditorAppLib
@testable import MarkupEditorMCP

final class MCPControlBackendTests {

    let sent = CallLog<ControlRequest>()
    let opened = CallLog<URL>()
    let openedWith = CallLog<String?>()

    func backend(reply: @escaping @Sendable (ControlRequest) -> ControlResponse = { .success(id: $0.id, "ok") },
                 open: @escaping @Sendable (URL) async throws -> Void = { _ in }) -> MCPControlBackend {
        MCPControlBackend(
            send: { [sent] request in sent.append(request); return reply(request) },
            open: { [opened, openedWith] url, appPath in opened.append(url); openedWith.append(appPath); try await open(url) })
    }

    @Test func theKnownToolNamesCoverOpenDocumentAndEveryControlTool() {
        #expect(MCPControlBackend.knownToolNames == Set(["open_document"] + ControlTools.all.map(\.name)))
    }

    @Test func withNoAppListeningOnlyOpenDocumentIsOffered() async {
        let unreachable = MCPControlBackend(send: { _ in throw ControlSocketError("not listening") }, open: { _, _ in })
        #expect(await unreachable.tools().map(\.name) == ["open_document"])
    }

    @Test func aConnectedAppOffersTheToolsItReports() async {
        let backend = backend(reply: { .success(id: $0.id, ["tools": ["app_state", "get_html", "not_a_tool"]]) })
        #expect(await backend.tools().map(\.name) == ["open_document", "app_state", "get_html"])
        #expect(sent.all.map(\.tool) == ["list_tools"])
    }

    @Test func anAppThatRefusesTheListOffersOnlyOpenDocument() async {
        let backend = backend(reply: { .failure(id: $0.id, "no") })
        #expect(await backend.tools().map(\.name) == ["open_document"])
    }

    @Test func aFullAppOffersEveryControlTool() async {
        let all = ControlTools.all.map { JSONValue.string($0.name) }
        let backend = backend(reply: { .success(id: $0.id, ["tools": .array(all)]) })
        #expect(await backend.tools().map(\.name) == ["open_document"] + ControlTools.all.map(\.name))
    }

    @Test func aControlToolIsSentOverTheChannelWithItsArguments() async {
        let result = await backend().call("eval_js", ["script": "1"])
        #expect(result == MCPToolResult([.text("ok")]))
        #expect(sent.all.map(\.tool) == ["eval_js"])
        #expect(sent.all.first?.args == ["script": "1"])
    }

    @Test func requestIdsAreDistinct() async {
        let backend = backend()
        _ = await backend.call("app_state", [:])
        _ = await backend.call("app_state", [:])
        #expect(Set(sent.all.map(\.id)).count == 2)
    }

    @Test func aStructuredResultIsPrettyPrintedJSON() async {
        let result = await backend(reply: { .success(id: $0.id, ["hasChanges": true, "url": "/a.md"]) }).call("app_state", [:])
        guard case .text(let text)? = result.content.first else { Issue.record("no text"); return }
        #expect(text.contains(#""hasChanges" : true"#))
        #expect(text.contains(#""url" : "\/a.md""#) || text.contains(#""url" : "/a.md""#))
    }

    @Test func aScreenshotBecomesAnImage() async {
        let result = await backend(reply: { .success(id: $0.id, ["png_base64": "AAAA"]) }).call("screenshot_editor", [:])
        #expect(result == MCPToolResult([.image(base64: "AAAA", mimeType: "image/png")]))
    }

    @Test func anAppErrorIsAnErrorResult() async {
        let result = await backend(reply: { .failure(id: $0.id, "no web view") }).call("get_html", [:])
        #expect(result == .error("no web view"))
    }

    @Test func aTransportFailureIsAnErrorResult() async {
        let failing = MCPControlBackend(send: { _ in throw ControlSocketError("not listening") }, open: { _, _ in })
        #expect(await failing.call("get_html", [:]) == .error("not listening"))
    }

    @Test func openDocumentOpensTheFileFromTheCallerNotInsideTheApp() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("open-\(UUID().uuidString).md")
        try "# hi".write(to: file, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: file) }

        let result = await backend().call("open_document", ["path": .string(file.path)])

        #expect(!result.isError)
        #expect(opened.all.map(\.path) == [file.path])
        #expect(sent.all.map(\.tool) == ["authorize_open"])
    }

    @Test func openDocumentOpensInTheAppOnTheOtherEndOfTheSocket() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("open-\(UUID().uuidString).md")
        try "# hi".write(to: file, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: file) }
        let backend = backend(reply: { .success(id: $0.id, ["allowed": true, "bundlePath": "/Debug/MarkupEditor.app"]) })

        _ = await backend.call("open_document", ["path": .string(file.path)])

        #expect(openedWith.all == ["/Debug/MarkupEditor.app"])
        #expect(sent.all.map(\.tool) == ["authorize_open"])
    }

    @Test func openDocumentIsRefusedWhenTheAppCannotBeAsked() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("open-\(UUID().uuidString).md")
        try "# hi".write(to: file, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: file) }
        for failure in [ControlSocketError("not listening"), ControlSocketError("read: Operation timed out")] {
            let unreachable = MCPControlBackend(send: { _ in throw failure }, open: { [openedWith] _, appPath in openedWith.append(appPath) })

            let result = await unreachable.call("open_document", ["path": .string(file.path)])

            #expect(result.isError)
        }
        #expect(openedWith.all.isEmpty)
    }

    @Test func openDocumentRejectsAMissingFileAndAMissingPath() async {
        let backend = backend()
        #expect(await backend.call("open_document", ["path": "/nonexistent/x.md"]).isError)
        #expect(await backend.call("open_document", [:]).isError)
        #expect(opened.all.isEmpty)
    }

    @Test func anOpenFailureIsAnErrorResult() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("open-\(UUID().uuidString).md")
        try "x".write(to: file, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: file) }
        let result = await backend(open: { _ in throw ControlSocketError("not installed") }).call("open_document", ["path": .string(file.path)])
        #expect(result == .error("not installed"))
    }

    @Test func openDocumentDoesNotOpenWhenTheAppRefusesTheClient() async throws {
        let file = FileManager.default.temporaryDirectory.appendingPathComponent("open-\(UUID().uuidString).md")
        try "x".write(to: file, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: file) }
        let backend = backend(reply: { .failure(id: $0.id, "Claude is not allowed to control MarkupEditor.") })

        let result = await backend.call("open_document", ["path": .string(file.path)])

        #expect(result == .error("Claude is not allowed to control MarkupEditor."))
        #expect(opened.all.isEmpty)
    }

    @Test func everyRequestCarriesTheClientIdentity() async throws {
        let claude = ClientIdentity(name: "Claude", path: "/A/Claude.app", bundleIdentifier: "com.anthropic.claude")
        let backend = MCPControlBackend(client: claude, send: { [sent] request in sent.append(request); return .success(id: request.id, "ok") }, open: { _, _ in })

        _ = await backend.call("get_document", [:])
        _ = await backend.tools()

        #expect(sent.all.map(\.tool) == ["get_document", "list_tools"])
        #expect(sent.all.allSatisfy { $0.client == claude })
    }
}
