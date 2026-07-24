//
//  MarkupWKWebView+Extension.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/26/26.
//

import MarkupEditor
import OSLog
internal import WebKit

extension MarkupWKWebView {

    public func importMarkdown(content: String?) async -> String? {
        guard let content else { return nil }
        return await withCheckedContinuation { continuation in
            executeJavaScript("MU.importMarkdown('\(content.escaped)')") { result, error in
                if let error { Logger.webview.error("Error importing Markdown: \(error)") }
                continuation.resume(returning: error == nil ? result as? String : nil)
            }
        }
    }
    
    public func exportMarkdown(content: String?) async -> String? {
        guard let content else { return nil }
        return await withCheckedContinuation { continuation in
            executeJavaScript("MU.exportMarkdown('\(content.escaped)')") { result, error in
                if let error { Logger.webview.error("Error exporting Markdown: \(error)") }
                continuation.resume(returning: error == nil ? result as? String : nil)
            }
        }
    }
    
}
