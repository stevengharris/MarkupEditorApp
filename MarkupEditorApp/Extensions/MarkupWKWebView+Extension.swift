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

    /// Export the contenteditable document content as PDF data, excluding the toolbar and search bar.
    ///
    /// Problems the naive `pdf(configuration:)` call doesn't solve on its own: the editor's scroll
    /// containers independently clip via `overflow-y: scroll`, so content outside whatever was
    /// currently scrolled into view is never painted even when `rect` is tall enough; and a focused
    /// editor shows selection/focus chrome (caret, node-selected outlines, resize handles, the
    /// code-block language tab, other codeview tabs) that doesn't belong in an export. Both are
    /// addressed by toggling the `Markup-exporting` class on `#editor` — every visual override lives
    /// in `markupeditor-app.css`..
    public func exportPDF() async throws -> Data {
        await setExporting(true)
        do {
            let config = WKPDFConfiguration()
            config.rect = try await contentEditableRect()
            let data = try await pdf(configuration: config)
            await setExporting(false)
            return data
        } catch {
            await setExporting(false)
            throw error
        }
    }

    // TODO: Methods compose JS that reaches into document structure directly; replace with
    // proper API calls if/when markupeditor-base exposes them.

    /// The bounding rect of just the contenteditable document area (the `.ProseMirror` element),
    /// in the web view's own coordinate space, excluding the toolbar and search bar.
    ///
    /// `.ProseMirror` sits inside `<markup-editor>`'s shadow root as a flow sibling of the toolbar
    /// and search bar, not their parent or child, so its own layout box already excludes both —
    /// whether or not the search bar happens to be showing. `offsetLeft`/`offsetTop`/`offsetWidth`/
    /// `offsetHeight` are used rather than `getBoundingClientRect()` because they reflect the full,
    /// scroll-position-independent layout box.
    private func contentEditableRect() async throws -> CGRect {
        let js = """
        const host = document.getElementById('markupeditor')
        const pm = host?.shadowRoot?.querySelector('.ProseMirror')
        if (!pm) return null
        return { x: pm.offsetLeft, y: pm.offsetTop, width: pm.offsetWidth, height: pm.offsetHeight }
        """
        guard let result = try await callAsyncJavaScript(js, contentWorld: .page) as? [String: Double],
              let x = result["x"], let y = result["y"],
              let width = result["width"], let height = result["height"] else {
            throw MarkupDocumentError.contentEditableNotFound
        }
        return CGRect(x: x, y: y, width: width, height: height)
    }

    /// Add or remove the `Markup-exporting` class on `#editor`. `markupeditor-app.css` keys every
    /// export-time visual override (scroll-clip neutralizing, caret/selection hiding, node-selected
    /// outlines, resize handles, the code-block language tab, other codeview tabs) off this one
    /// class as a `#editor.Markup-exporting <target>` descendant rule. Removing the
    /// class instantly reverts everything.
    private func setExporting(_ exporting: Bool) async {
        let js = """
        const host = document.getElementById('markupeditor')
        const editor = host?.shadowRoot?.getElementById('editor')
        editor?.classList.toggle('Markup-exporting', \(exporting))
        """
        do {
            _ = try await callAsyncJavaScript(js, contentWorld: .page)
        } catch {
            Logger.webview.error("Error toggling PDF export state: \(error)")
        }
    }

}
