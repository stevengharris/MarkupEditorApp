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
        await withCheckedContinuation { continuation in
            importMarkdown(content: content) { result in
                continuation.resume(with: .success(result))
            }
        }
    }

    public func importMarkdown(content: String?, _ handler: ((String?) -> Void)?) {
        guard let content else {
            handler?(nil)
            return
        }
        executeJavaScript("MU.importMarkdown('\(content.escaped)')") { result, error in
            if let error {
                Logger.webview.error("Error importing Markdown: \(error)")
                handler?(nil)
                return
            }
            handler?(result as? String)
        }
    }
    
    public func exportMarkdown(content: String?) async -> String? {
        await withCheckedContinuation { continuation in
            exportMarkdown(content: content) { result in
                continuation.resume(with: .success(result))
            }
        }
    }

    public func exportMarkdown(content: String?, _ handler: ((String?) -> Void)?) {
        guard let content else {
            handler?(nil)
            return
        }
        executeJavaScript("MU.exportMarkdown('\(content.escaped)')") { result, error in
            if let error {
                Logger.webview.error("Error exporting Markdown: \(error)")
                handler?(nil)
                return
            }
            handler?(result as? String)
        }
    }
    
}
