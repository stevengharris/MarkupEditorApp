//
//  MCPRegistrationTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct MCPRegistrationTests {

    let path = "/Applications/MarkupEditor.app/Contents/Resources/bin/markup"

    @Test func theClaudeCodeCommandQuotesTheAbsolutePath() {
        #expect(MCPRegistration.claudeCodeCommand(toolPath: path) == "claude mcp add markupeditor -- '\(path)' mcp")
    }

    @Test func aPathWithSpacesAndQuotesSurvivesAShell() {
        let awkward = "/Users/o'brien/My Apps/MarkupEditor.app/Contents/Resources/bin/markup"
        let command = MCPRegistration.claudeCodeCommand(toolPath: awkward)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/sh")
        process.arguments = ["-c", "set -- \(command.replacingOccurrences(of: "claude mcp add markupeditor -- ", with: "")); printf '%s\\n' \"$1\" \"$2\""]
        let pipe = Pipe()
        process.standardOutput = pipe
        try? process.run()
        process.waitUntilExit()
        let words = String(decoding: pipe.fileHandleForReading.readDataToEndOfFile(), as: UTF8.self).split(separator: "\n").map(String.init)
        #expect(words == [awkward, "mcp"])
    }

    @Test func theJSONConfigIsValidAndNamesTheCommandAndArguments() throws {
        let text = MCPRegistration.jsonConfig(toolPath: path)
        let parsed = try JSONDecoder().decode(JSONValue.self, from: Data(text.utf8))
        #expect(parsed["mcpServers"]?["markupeditor"]?["command"] == .string(path))
        #expect(parsed["mcpServers"]?["markupeditor"]?["args"] == ["mcp"])
        #expect(text.contains(path), "slashes must not be escaped for a pasted config")
    }

    @Test func theJSONConfigEscapesQuotesInThePath() throws {
        let tricky = #"/Users/a"b/markup"#
        let parsed = try JSONDecoder().decode(JSONValue.self, from: Data(MCPRegistration.jsonConfig(toolPath: tricky).utf8))
        #expect(parsed["mcpServers"]?["markupeditor"]?["command"] == .string(tricky))
    }
}
