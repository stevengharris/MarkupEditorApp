//
//  MCPServerTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Synchronization
import Testing
@testable import MarkupEditorAppLib

final class MCPServerTests: Sendable {

    let calls = CallLog<String>()

    func server() -> MCPServer {
        MCPServer(name: "markup", version: "1.2.3", tools: ControlTools.all) { [calls] name, arguments in
            calls.append("\(name):\(arguments["script"]?.stringValue ?? "")")
            return name == "eval_js" ? MCPToolResult([.text("42")]) : .error("nope")
        }
    }

    func send(_ json: String) async throws -> JSONValue? {
        guard let reply = await server().handle(Data(json.utf8)) else { return nil }
        return try JSONDecoder().decode(JSONValue.self, from: reply)
    }

    @Test func initializeNegotiatesAKnownVersionAndAdvertisesTools() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-03-26"}}"#))
        #expect(reply["id"] == 1)
        #expect(reply["result"]?["protocolVersion"] == "2025-03-26")
        #expect(reply["result"]?["capabilities"]?["tools"] != nil)
        #expect(reply["result"]?["serverInfo"] == ["name": "markup", "version": "1.2.3"])
    }

    @Test func anUnknownClientVersionGetsTheLatestSupported() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"1999-01-01"}}"#))
        #expect(reply["result"]?["protocolVersion"] == "2025-11-25")
    }

    @Test func theNewestSpecVersionIsNegotiated() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}"#))
        #expect(reply["result"]?["protocolVersion"] == "2025-11-25")
    }

    @Test func theServerAdvertisesThatItsToolListCanChange() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18"}}"#))
        #expect(reply["result"]?["capabilities"]?["tools"]?["listChanged"] == true)
    }

    @Test func notificationsGetNoReply() async throws {
        #expect(try await send(#"{"jsonrpc":"2.0","method":"notifications/initialized"}"#) == nil)
    }

    @Test func pingAnswersWithAnEmptyResult() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":"abc","method":"ping"}"#))
        #expect(reply["id"] == "abc")
        #expect(reply["result"] == [:])
    }

    @Test func toolsListDescribesEveryTool() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#))
        guard case .array(let tools)? = reply["result"]?["tools"] else { Issue.record("no tools array"); return }
        #expect(tools.compactMap { $0["name"]?.stringValue } == ControlTools.all.map(\.name))
        #expect(tools.allSatisfy { $0["description"]?.stringValue?.isEmpty == false && $0["inputSchema"]?["type"] == "object" })
        #expect(tools.allSatisfy { $0["title"]?.stringValue?.isEmpty == false })
    }

    @Test func toolsListCarriesBehaviorHints() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#))
        guard case .array(let tools)? = reply["result"]?["tools"] else { Issue.record("no tools array"); return }
        let byName = Dictionary(uniqueKeysWithValues: tools.compactMap { tool in tool["name"]?.stringValue.map { ($0, tool) } })
        #expect(byName["get_html"]?["annotations"]?["readOnlyHint"] == true)
        #expect(byName["get_html"]?["annotations"]?["destructiveHint"] == nil)
        #expect(byName["save_document"]?["annotations"]?["readOnlyHint"] == false)
        #expect(byName["save_document"]?["annotations"]?["destructiveHint"] == true)
        #expect(byName["type_text"]?["annotations"]?["destructiveHint"] == false)
        #expect(tools.allSatisfy { $0["annotations"]?["openWorldHint"] == false })
    }

    @Test func toolsCallRunsTheToolAndShapesTheResult() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"eval_js","arguments":{"script":"1+1"}}}"#))
        #expect(reply["result"]?["isError"] == false)
        #expect(reply["result"]?["content"] == [["type": "text", "text": "42"]])
        #expect(calls.all == ["eval_js:1+1"])
    }

    @Test func aToolFailureIsReportedAsAnErrorResultNotAProtocolError() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_html"}}"#))
        #expect(reply["error"] == nil)
        #expect(reply["result"]?["isError"] == true)
    }

    @Test func anUnknownToolIsAProtocolError() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"rm_rf"}}"#))
        #expect(reply["error"]?["code"] == -32602)
        #expect(calls.all.isEmpty)
    }

    @Test func anUnknownMethodIsMethodNotFound() async throws {
        let reply = try #require(try await send(#"{"jsonrpc":"2.0","id":5,"method":"resources/list"}"#))
        #expect(reply["error"]?["code"] == -32601)
    }

    @Test func garbageIsAParseError() async throws {
        let reply = try #require(try await send("not json"))
        #expect(reply["error"]?["code"] == -32700)
        #expect(reply["id"] == .null)
    }

    @Test func theLoopAnswersEachLineAndStopsAtEndOfInput() async throws {
        let input = Pipe(), output = Pipe()
        let ping1 = #"{"jsonrpc":"2.0","id":1,"method":"ping"}"#
        let note = #"{"jsonrpc":"2.0","method":"notifications/initialized"}"#
        let ping2 = #"{"jsonrpc":"2.0","id":2,"method":"ping"}"#
        let script = [ping1, note, ping2].joined(separator: "\n") + "\n"
        input.fileHandleForWriting.write(Data(script.utf8))
        try input.fileHandleForWriting.close()

        await server().run(input: input.fileHandleForReading, output: output.fileHandleForWriting)
        try output.fileHandleForWriting.close()

        let text = String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self)
        let lines = text.split(separator: "\n")
        #expect(lines.count == 2)
        #expect(lines.first?.contains(#""id":1"#) == true)
        #expect(lines.last?.contains(#""id":2"#) == true)
    }

    // MARK: Tool list that follows availability

    /// A server whose offered tools can be switched while it runs.
    func switchableServer(_ offered: OfferedTools) -> MCPServer {
        MCPServer(name: "markup", version: "1", tools: { offered.current }) { _, _ in MCPToolResult([.text("ok")]) }
    }

    func lines(_ pipe: Pipe) -> [String] {
        String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).split(separator: "\n").map(String.init)
    }

    /// Runs `server` over pipes: sends `script`, waits `delay` while it runs, then closes input.
    func run(_ server: MCPServer, script: [String], delay: Duration, whileRunning: () -> Void = {}) async -> [String] {
        let input = Pipe(), output = Pipe()
        let finished = Task { await server.run(input: input.fileHandleForReading, output: output.fileHandleForWriting, pollInterval: .milliseconds(20)) }
        for line in script { input.fileHandleForWriting.write(Data((line + "\n").utf8)) }
        try? await Task.sleep(for: delay / 2)
        whileRunning()
        try? await Task.sleep(for: delay / 2)
        try? input.fileHandleForWriting.close()
        await finished.value
        try? output.fileHandleForWriting.close()
        return lines(output)
    }

    static let initialize = #"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25"}}"#
    static let initialized = #"{"jsonrpc":"2.0","method":"notifications/initialized"}"#
    static let listTools = #"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#

    /// How many lines are `tools/list_changed` notifications. Parsed, since JSON may escape the slashes.
    func announcements(_ out: [String]) -> Int {
        out.filter { line in
            (try? JSONDecoder().decode(JSONValue.self, from: Data(line.utf8)))?["method"] == "notifications/tools/list_changed"
        }.count
    }

    @Test func aToolListThatShrinksIsReflectedAndAToolNoLongerOfferedCannotBeCalled() async throws {
        let offered = OfferedTools([ControlTools.all[0]])
        let server = switchableServer(offered)
        let list = try #require(await server.handle(Data(Self.listTools.utf8)))
        let listed = try JSONDecoder().decode(JSONValue.self, from: list)
        #expect(listed["result"]?["tools"]?.arrayCount == 1)

        let call = #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_html"}}"#
        let reply = try #require(await server.handle(Data(call.utf8)))
        #expect(try JSONDecoder().decode(JSONValue.self, from: reply)["error"]?["code"] == -32602)
    }

    @Test func aKnownToolThatIsNotOfferedIsStillForwardedSoTheAppCanExplain() async throws {
        let offered = OfferedTools([ControlTools.all[0]])
        let server = MCPServer(name: "markup", version: "1", tools: { offered.current }, knownNames: Set(ControlTools.all.map(\.name))) { name, _ in
            .error("\(name) is read-only here")
        }
        let call = #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"replace_selection"}}"#
        let reply = try #require(await server.handle(Data(call.utf8)))
        let parsed = try JSONDecoder().decode(JSONValue.self, from: reply)
        #expect(parsed["error"] == nil)
        #expect(parsed["result"]?["isError"] == true)
        #expect(parsed["result"]?["content"] == [["type": "text", "text": "replace_selection is read-only here"]])
    }

    @Test func aNameNobodyKnowsIsStillAProtocolErrorEvenWithKnownNamesSet() async throws {
        let server = MCPServer(name: "markup", version: "1", tools: { [] }, knownNames: ["get_html"]) { _, _ in MCPToolResult([.text("ok")]) }
        let call = #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"rm_rf"}}"#
        let reply = try #require(await server.handle(Data(call.utf8)))
        #expect(try JSONDecoder().decode(JSONValue.self, from: reply)["error"]?["code"] == -32602)
    }

    @Test func aChangeInTheOfferedToolsIsAnnouncedAfterInitialization() async {
        let offered = OfferedTools([ControlTools.all[0]])
        let out = await run(switchableServer(offered), script: [Self.initialize, Self.initialized, Self.listTools], delay: .milliseconds(300)) {
            offered.set(ControlTools.all)
        }
        #expect(announcements(out) == 1)
    }

    @Test func anUnchangedToolListSendsNoNotification() async {
        let offered = OfferedTools([ControlTools.all[0]])
        let out = await run(switchableServer(offered), script: [Self.initialize, Self.initialized, Self.listTools], delay: .milliseconds(200))
        #expect(announcements(out) == 0)
    }

    @Test func nothingIsAnnouncedBeforeTheClientHasListedTools() async {
        let offered = OfferedTools([ControlTools.all[0]])
        let out = await run(switchableServer(offered), script: [Self.initialize, Self.initialized], delay: .milliseconds(300)) {
            offered.set(ControlTools.all)
        }
        #expect(announcements(out) == 0)
    }

    @Test func nothingIsAnnouncedBeforeInitialization() async {
        let offered = OfferedTools([ControlTools.all[0]])
        let out = await run(switchableServer(offered), script: [Self.initialize, Self.listTools], delay: .milliseconds(300)) {
            offered.set(ControlTools.all)
        }
        #expect(announcements(out) == 0)
    }
}

private extension JSONValue {
    var arrayCount: Int? {
        guard case .array(let items) = self else { return nil }
        return items.count
    }
}

/// The tools a test server currently offers, changeable while it runs.
final class OfferedTools: Sendable {
    private let value: Mutex<[ControlTool]>
    init(_ tools: [ControlTool]) { value = Mutex(tools) }
    var current: [ControlTool] { value.withLock { $0 } }
    func set(_ tools: [ControlTool]) { value.withLock { $0 = tools } }
}
