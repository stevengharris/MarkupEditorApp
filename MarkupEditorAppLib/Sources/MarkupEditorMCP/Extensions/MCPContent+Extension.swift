//
//  MCPContent+Extension.swift
//  MarkupEditorMCP
//

import MarkupEditorAppLib
import MCP

extension MCPContent {
    var sdkContent: Tool.Content {
        switch self {
        case .text(let text): .text(text: text, annotations: nil, _meta: nil)
        case .image(let base64, let mimeType): .image(data: base64, mimeType: mimeType, annotations: nil, _meta: nil)
        }
    }
}
