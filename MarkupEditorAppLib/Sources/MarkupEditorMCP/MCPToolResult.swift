//
//  MCPToolResult.swift
//  MarkupEditorMCP
//

import Foundation

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
