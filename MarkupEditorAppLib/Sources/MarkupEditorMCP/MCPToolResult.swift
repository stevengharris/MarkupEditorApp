//
//  MCPToolResult.swift
//  MarkupEditorMCP
//

import Foundation

/// A piece of a tool result, as MCP carries it.
public enum MCPContent: Sendable, Equatable {
    case text(String)
    case image(base64: String, mimeType: String)

}

public struct MCPToolResult: Sendable, Equatable {
    public var content: [MCPContent]
    public var isError: Bool

    public init(_ content: [MCPContent], isError: Bool = false) {
        self.content = content
        self.isError = isError
    }

    public static func error(_ message: String) -> MCPToolResult {
        MCPToolResult([.text(message)], isError: true)
    }
}
