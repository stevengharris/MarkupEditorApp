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
    /// containers (`#editor`, `.Markup-toolbar-wrapper`) independently clip via `overflow-y: scroll`, so
    /// content outside whatever was currently scrolled into view is never painted even when `rect` is tall
    /// enough; a focused editor shows a blinking caret; a selected node (e.g. an image) shows a selection
    /// outline; and a code block with the cursor inside it shows its language tab button. None of that
    /// belongs in an export. All of it is addressed by temporarily mutating the DOM before capture and
    /// always restoring it afterward.
    public func exportPDF() async throws -> Data {
        await prepareForPDFExport()
        do {
            let config = WKPDFConfiguration()
            config.rect = try await contentEditableRect()
            let data = try await pdf(configuration: config)
            await restorePDFExportState()
            return data
        } catch {
            await restorePDFExportState()
            throw error
        }
    }

    
    // TODO: Replace this kind of "compose JS that references document elements and styling" with proper API calls, providing new API if not available.
    
    /// The bounding rect of just the contenteditable document area (the `.ProseMirror` element),
    /// in the web view's own coordinate space, excluding the toolbar and search bar.
    ///
    /// `.ProseMirror` sits inside `<markup-editor>`'s shadow root as a flow sibling of the toolbar
    /// and search bar, not their parent or child, so its own layout box already excludes both —
    /// whether or not the search bar happens to be showing. `offsetLeft`/`offsetTop`/`offsetWidth`/
    /// `offsetHeight` are used rather than `getBoundingClientRect()` because they reflect the full,
    /// scroll-position-independent layout box.
    ///
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

    /// Neutralize the editor's internal scroll clipping so the full document lays out and paints
    /// (not just whatever was scrolled into view), and hide every visual selection/focus indicator
    /// that shouldn't appear in an export:
    /// - the text caret/selection highlight, via ProseMirror's own `ProseMirror-hideselection` class;
    /// - any node-selected outline (currently images; generic to whatever node type ProseMirror
    ///   applies `ProseMirror-selectednode` to via `imageview.js`'s `classList.add`/`remove` idiom —
    ///   not image-specific, so this covers future NodeSelection-based node types for free);
    /// - an image's resize handles, which are separate DOM elements (`.resize-handle`) inserted by
    ///   `ResizableImage.select()` (`imageview.js`) independently of the `ProseMirror-selectednode`
    ///   class — hidden via `display: none` rather than calling `.deselect()` directly, since that
    ///   also tears down the resize mousedown/pinch-gesture event listeners, which we don't want to
    ///   disturb just to capture a PDF;
    /// - the code-block language tab button, which `codeview.js`'s `CodeView.setActive` connects to
    ///   the DOM only while the cursor is inside that code block (`Markup-code-language-tab`). This
    ///   is generic CodeView infrastructure, not specific to any one CodeView plugin (there's
    ///   currently only `code_block` itself, but this targets the shared class every CodeView tab
    ///   uses, not a plugin-specific selector);
    /// - the dashed outline `markup.css` draws around a resized image's `<img>` (`.resize-container
    ///   img { outline: ... dashed }`) — a separate mechanism from `ProseMirror-selectednode`'s solid
    ///   outline, not covered by removing that class;
    /// - **Mermaid-specific, hardcoded, not generic** (`markupeditor-mermaid/src/mermaidview.js`):
    ///   the always-present Source/Diagram mode-toggle tabs (`mermaid-mode-toggle`) and the selected-
    ///   diagram dashed outline (`mermaid-diagram-selected`). `MermaidView extends MU.CodeView` but
    ///   adds this chrome itself; there is currently no shared `markupeditor-base` convention a
    ///   CodeView plugin's own non-content chrome is expected to follow, so a *different* CodeView
    ///   plugin with its own bespoke selection/chrome UI would NOT be covered by this method today.
    ///   Revisit if that becomes a real case — the honest fix is a shared base-class convention, not
    ///   more hardcoded plugin class names here.
    /// Always pair with `restorePDFExportState()`.
    private func prepareForPDFExport() async {
        let js = """
        const host = document.getElementById('markupeditor')
        const root = host?.shadowRoot
        const editor = root?.getElementById('editor')
        const wrapper = root?.querySelector('.Markup-toolbar-wrapper')
        const pm = root?.querySelector('.ProseMirror')
        if (editor) {
            editor.dataset.savedOverflow = editor.style.overflow
            editor.dataset.savedHeight = editor.style.height
            editor.style.overflow = 'visible'
            editor.style.height = 'auto'
        }
        if (wrapper) {
            wrapper.dataset.savedOverflow = wrapper.style.overflow
            wrapper.dataset.savedHeight = wrapper.style.height
            wrapper.style.overflow = 'visible'
            wrapper.style.height = 'auto'
        }
        pm?.classList.add('ProseMirror-hideselection')
        root?.querySelectorAll('.ProseMirror-selectednode, .mermaid-diagram-selected').forEach(el => {
            if (el.classList.contains('ProseMirror-selectednode')) el.dataset.wasSelectednode = 'true'
            if (el.classList.contains('mermaid-diagram-selected')) el.dataset.wasMermaidSelected = 'true'
            el.classList.remove('ProseMirror-selectednode', 'mermaid-diagram-selected')
        })
        root?.querySelectorAll('.Markup-code-language-tab, .resize-handle, .mermaid-mode-toggle').forEach(el => {
            el.dataset.savedDisplay = el.style.display
            el.style.display = 'none'
        })
        root?.querySelectorAll('.resize-container img').forEach(el => {
            el.dataset.savedOutline = el.style.outline
            el.style.outline = 'none'
        })
        """
        do {
            _ = try await callAsyncJavaScript(js, contentWorld: .page)
        } catch {
            Logger.webview.error("Error preparing web view for PDF export: \(error)")
        }
    }

    /// Undo the DOM changes made by `prepareForPDFExport()`.
    private func restorePDFExportState() async {
        let js = """
        const host = document.getElementById('markupeditor')
        const root = host?.shadowRoot
        const editor = root?.getElementById('editor')
        const wrapper = root?.querySelector('.Markup-toolbar-wrapper')
        const pm = root?.querySelector('.ProseMirror')
        if (editor) {
            editor.style.overflow = editor.dataset.savedOverflow ?? ''
            editor.style.height = editor.dataset.savedHeight ?? ''
        }
        if (wrapper) {
            wrapper.style.overflow = wrapper.dataset.savedOverflow ?? ''
            wrapper.style.height = wrapper.dataset.savedHeight ?? ''
        }
        pm?.classList.remove('ProseMirror-hideselection')
        root?.querySelectorAll('[data-was-selectednode="true"], [data-was-mermaid-selected="true"]').forEach(el => {
            if (el.dataset.wasSelectednode === 'true') el.classList.add('ProseMirror-selectednode')
            if (el.dataset.wasMermaidSelected === 'true') el.classList.add('mermaid-diagram-selected')
            delete el.dataset.wasSelectednode
            delete el.dataset.wasMermaidSelected
        })
        root?.querySelectorAll('.Markup-code-language-tab, .resize-handle, .mermaid-mode-toggle').forEach(el => {
            el.style.display = el.dataset.savedDisplay ?? ''
            delete el.dataset.savedDisplay
        })
        root?.querySelectorAll('.resize-container img').forEach(el => {
            el.style.outline = el.dataset.savedOutline ?? ''
            delete el.dataset.savedOutline
        })
        """
        do {
            _ = try await callAsyncJavaScript(js, contentWorld: .page)
        } catch {
            Logger.webview.error("Error restoring web view after PDF export: \(error)")
        }
    }

}
