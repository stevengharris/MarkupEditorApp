//
//  MCPRegistration.swift
//  MarkupEditorAppLib
//

import Foundation

/// The text a user pastes to register MarkupEditor's MCP server with an assistant. The command is
/// always the absolute path of the bundled tool: apps launched from the Dock have a minimal PATH,
/// so a bare `markup` would not be found.
public enum MCPRegistration {

    public static let serverName = "markupeditor"

    /// A `claude mcp add` command for Claude Code, with the path quoted for a shell.
    public static func claudeCodeCommand(toolPath: String) -> String {
        "claude mcp add \(serverName) -- \(shellQuoted(toolPath)) mcp"
    }

    /// An `mcpServers` entry for a JSON config such as Claude Desktop's.
    public static func jsonConfig(toolPath: String) -> String {
        let config: JSONValue = ["mcpServers": .object([serverName: ["command": .string(toolPath), "args": ["mcp"]]])]
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        return (try? encoder.encode(config)).flatMap { String(data: $0, encoding: .utf8) } ?? "{}"
    }

    /// `text` in single quotes, safe to paste into a shell.
    static func shellQuoted(_ text: String) -> String {
        "'" + text.replacingOccurrences(of: "'", with: "'\\''") + "'"
    }
}
