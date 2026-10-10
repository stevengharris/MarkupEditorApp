//
//  MCPContent.swift
//  MarkupEditorMCP
//

import Foundation

/// A piece of a tool result, as MCP carries it.
public enum MCPContent: Sendable, Equatable {
    case text(String)
    case image(base64: String, mimeType: String)

}
