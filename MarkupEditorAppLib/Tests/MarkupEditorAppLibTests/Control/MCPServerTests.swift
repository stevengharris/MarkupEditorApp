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

    static let clientInfo = #""capabilities":{},"clientInfo":{"name":"t","version":"1"}"#
    static let initialized = #"{"jsonrpc":"2.0","method":"notifications/initialized"}"#

    static func initialize(_ version: String = "2025-11-25") -> String {
        #"{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"\#(version)",\#(clientInfo)}}"#
    }

    /// Runs `server` over pipes: sends `script`, waits `delay` while it runs, then closes input.
    func run(_ server: MCPServer, script: [String], delay: Duration = .milliseconds(150), whileRunning: () -> Void = {}) async -> [String] {
        let input = Pipe(), output = Pipe()
        let finished = Task { await server.run(input: input.fileHandleForReading, output: output.fileHandleForWriting, pollInterval: .milliseconds(20)) }
        for line in script { input.fileHandleForWriting.write(Data((line + "\n").utf8)) }
        try? await Task.sleep(for: delay / 2)
        whileRunning()
        try? await Task.sleep(for: delay / 2)
        try? input.fileHandleForWriting.close()
        await finished.value
        try? output.fileHandleForWriting.close()
        return String(decoding: output.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).split(separator: "\n").map(String.init)
    }

    func parse(_ lines: [String]) throws -> [JSONValue] {
        try lines.map { try JSONDecoder().decode(JSONValue.self, from: Data($0.utf8)) }
    }

    /// The reply to the request with `id`, after a successful initialize handshake.
    func reply(to request: String, id: JSONValue, using server: MCPServer? = nil) async throws -> JSONValue {
        let out = await run(server ?? self.server(), script: [Self.initialize(), Self.initialized, request])
        return try #require(try parse(out).first { $0["id"] == id })
    }

    func switchableServer(_ offered: OfferedTools, knownNames: Set<String>? = nil, call: @escaping MCPServer.CallTool = { _, _ in MCPToolResult([.text("ok")]) }) -> MCPServer {
        MCPServer(name: "markup", version: "1", tools: { offered.current }, knownNames: knownNames, call: call)
    }

    static let listTools = #"{"jsonrpc":"2.0","id":2,"method":"tools/list"}"#

    func toolsList() async throws -> [JSONValue] {
        let reply = try await reply(to: Self.listTools, id: 2)
        guard case .array(let tools)? = reply["result"]?["tools"] else { Issue.record("no tools array"); return [] }
        return tools
    }

    @Test func initializeNegotiatesAKnownVersionAndAdvertisesTools() async throws {
        let out = try parse(await run(server(), script: [Self.initialize("2025-03-26")]))
        let reply = try #require(out.first)
        #expect(reply["id"] == 1)
        #expect(reply["result"]?["protocolVersion"] == "2025-03-26")
        #expect(reply["result"]?["capabilities"]?["tools"] != nil)
        #expect(reply["result"]?["serverInfo"]?["name"] == "markup")
        #expect(reply["result"]?["serverInfo"]?["version"] == "1.2.3")
    }

    @Test func anUnknownClientVersionGetsTheLatestSupported() async throws {
        let reply = try #require(try parse(await run(server(), script: [Self.initialize("1999-01-01")])).first)
        #expect(reply["result"]?["protocolVersion"] == "2025-11-25")
    }

    @Test func theNewestSpecVersionIsNegotiated() async throws {
        let reply = try #require(try parse(await run(server(), script: [Self.initialize("2025-11-25")])).first)
        #expect(reply["result"]?["protocolVersion"] == "2025-11-25")
    }

    @Test func theServerAdvertisesThatItsToolListCanChange() async throws {
        let reply = try #require(try parse(await run(server(), script: [Self.initialize("2025-06-18")])).first)
        #expect(reply["result"]?["capabilities"]?["tools"]?["listChanged"] == true)
    }

    @Test func notificationsGetNoReply() async throws {
        let out = await run(server(), script: [Self.initialize(), Self.initialized])
        #expect(out.count == 1)
    }

    @Test func pingAnswersWithAnEmptyResult() async throws {
        let reply = try await reply(to: #"{"jsonrpc":"2.0","id":"abc","method":"ping"}"#, id: "abc")
        #expect(reply["result"] == [:])
    }

    @Test func toolsListDescribesEveryTool() async throws {
        let tools = try await toolsList()
        #expect(tools.compactMap { $0["name"]?.stringValue } == ControlTools.all.map(\.name))
        #expect(tools.allSatisfy { $0["description"]?.stringValue?.isEmpty == false && $0["inputSchema"]?["type"] == "object" })
        #expect(tools.allSatisfy { $0["title"]?.stringValue?.isEmpty == false })
    }

    @Test func toolsListCarriesBehaviorHints() async throws {
        let tools = try await toolsList()
        let byName = Dictionary(uniqueKeysWithValues: tools.compactMap { tool in tool["name"]?.stringValue.map { ($0, tool) } })
        #expect(byName["get_html"]?["annotations"]?["readOnlyHint"] == true)
        #expect(byName["get_html"]?["annotations"]?["destructiveHint"] == nil)
        #expect(byName["save_document"]?["annotations"]?["readOnlyHint"] == false)
        #expect(byName["save_document"]?["annotations"]?["destructiveHint"] == true)
        #expect(byName["type_text"]?["annotations"]?["destructiveHint"] == false)
        #expect(tools.allSatisfy { $0["annotations"]?["openWorldHint"] == false })
    }

    @Test func toolsCallRunsTheToolAndShapesTheResult() async throws {
        let reply = try await reply(to: #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"eval_js","arguments":{"script":"1+1"}}}"#, id: 3)
        #expect(reply["result"]?["isError"] == false)
        #expect(reply["result"]?["content"] == [["type": "text", "text": "42"]])
        #expect(calls.all == ["eval_js:1+1"])
    }

    @Test func anImageResultIsShapedAsImageContent() async throws {
        let server = MCPServer(name: "markup", version: "1", tools: ControlTools.all) { _, _ in MCPToolResult([.image(base64: "AAAA", mimeType: "image/png")]) }
        let reply = try await reply(to: #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_html"}}"#, id: 3, using: server)
        #expect(reply["result"]?["content"] == [["type": "image", "data": "AAAA", "mimeType": "image/png"]])
    }

    @Test func aToolFailureIsReportedAsAnErrorResultNotAProtocolError() async throws {
        let reply = try await reply(to: #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_html"}}"#, id: 3)
        #expect(reply["error"] == nil)
        #expect(reply["result"]?["isError"] == true)
    }

    @Test func anUnknownToolIsAProtocolError() async throws {
        let reply = try await reply(to: #"{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"rm_rf"}}"#, id: 4)
        #expect(reply["error"]?["code"] == -32602)
        #expect(calls.all.isEmpty)
    }

    @Test func anUnknownMethodIsMethodNotFound() async throws {
        let reply = try await reply(to: #"{"jsonrpc":"2.0","id":5,"method":"resources/list"}"#, id: 5)
        #expect(reply["error"]?["code"] == -32601)
    }

    @Test func garbageIsAParseError() async throws {
        let out = try parse(await run(server(), script: [Self.initialize(), Self.initialized, "not json"]))
        #expect(out.contains { $0["error"]?["code"] == -32700 })
    }

    @Test func theLoopAnswersEachRequestAndStopsAtEndOfInput() async throws {
        let ping1 = #"{"jsonrpc":"2.0","id":2,"method":"ping"}"#
        let ping2 = #"{"jsonrpc":"2.0","id":3,"method":"ping"}"#
        let out = try parse(await run(server(), script: [Self.initialize(), Self.initialized, ping1, ping2]))
        #expect(out.compactMap { $0["id"]?.intValue }.sorted() == [1, 2, 3])
    }

    // MARK: Tool list that follows availability

    /// How many lines are `tools/list_changed` notifications.
    func announcements(_ out: [String]) throws -> Int {
        try parse(out).filter { $0["method"] == "notifications/tools/list_changed" }.count
    }

    @Test func aToolListThatShrinksIsReflectedAndAToolNoLongerOfferedCannotBeCalled() async throws {
        let server = switchableServer(OfferedTools([ControlTools.all[0]]))
        let list = try await reply(to: Self.listTools, id: 2, using: server)
        #expect(list["result"]?["tools"]?.arrayCount == 1)

        let call = #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"get_html"}}"#
        #expect(try await reply(to: call, id: 3, using: server)["error"]?["code"] == -32602)
    }

    @Test func aKnownToolThatIsNotOfferedIsStillForwardedSoTheAppCanExplain() async throws {
        let server = switchableServer(OfferedTools([ControlTools.all[0]]), knownNames: Set(ControlTools.all.map(\.name))) { name, _ in
            .error("\(name) is read-only here")
        }
        let call = #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"replace_selection"}}"#
        let parsed = try await reply(to: call, id: 3, using: server)
        #expect(parsed["error"] == nil)
        #expect(parsed["result"]?["isError"] == true)
        #expect(parsed["result"]?["content"] == [["type": "text", "text": "replace_selection is read-only here"]])
    }

    @Test func aNameNobodyKnowsIsStillAProtocolErrorEvenWithKnownNamesSet() async throws {
        let server = switchableServer(OfferedTools([]), knownNames: ["get_html"])
        let call = #"{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"rm_rf"}}"#
        #expect(try await reply(to: call, id: 3, using: server)["error"]?["code"] == -32602)
    }

    @Test func aChangeInTheOfferedToolsIsAnnouncedAfterInitialization() async throws {
        let offered = OfferedTools([ControlTools.all[0]])
        let out = await run(switchableServer(offered), script: [Self.initialize(), Self.initialized, Self.listTools], delay: .milliseconds(300)) {
            offered.set(ControlTools.all)
        }
        #expect(try announcements(out) == 1)
    }

    @Test func anUnchangedToolListSendsNoNotification() async throws {
        let offered = OfferedTools([ControlTools.all[0]])
        let out = await run(switchableServer(offered), script: [Self.initialize(), Self.initialized, Self.listTools], delay: .milliseconds(200))
        #expect(try announcements(out) == 0)
    }

    @Test func nothingIsAnnouncedBeforeTheClientHasListedTools() async throws {
        let offered = OfferedTools([ControlTools.all[0]])
        let out = await run(switchableServer(offered), script: [Self.initialize(), Self.initialized], delay: .milliseconds(300)) {
            offered.set(ControlTools.all)
        }
        #expect(try announcements(out) == 0)
    }

    @Test func nothingIsAnnouncedBeforeInitialization() async throws {
        let offered = OfferedTools([ControlTools.all[0]])
        let out = await run(switchableServer(offered), script: [Self.initialize(), Self.listTools], delay: .milliseconds(300)) {
            offered.set(ControlTools.all)
        }
        #expect(try announcements(out) == 0)
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
