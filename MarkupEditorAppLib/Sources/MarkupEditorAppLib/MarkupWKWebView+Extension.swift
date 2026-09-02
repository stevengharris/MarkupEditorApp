//
//  MarkupWKWebView+Extension.swift
//  MarkupEditorAppLib
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

    /// The top-level block index (0-based) containing the active editor's current selection,
    /// or `nil` if there is no active view (`MU.getSelectionBlockIndex()` returns JS `null` in
    /// that case) or the JS call itself errors.
    public func getSelectionBlockIndex() async -> Int? {
        await withCheckedContinuation { continuation in
            executeJavaScript("MU.getSelectionBlockIndex()") { result, error in
                if let error { Logger.webview.error("Error getting selection block index: \(error)") }
                continuation.resume(returning: error == nil ? Self.jsInt(result) : nil)
            }
        }
    }

    /// Select the start of the `index`th top-level block in the active editor. No-ops when
    /// there is no active view or `index` is out of range (`MU.selectBlockIndex` clamps rather
    /// than throwing -- see markupeditor-app/src/blocks.js).
    public func selectBlockIndex(_ index: Int) async {
        await withCheckedContinuation { continuation in
            executeJavaScript("MU.selectBlockIndex(\(index))") { _, error in
                if let error { Logger.webview.error("Error selecting block index \(index): \(error)") }
                continuation.resume()
            }
        }
    }

    /// The top-level markdown block index (0-based) containing `offset` in `markdownText`, or
    /// `nil` on error.
    ///
    /// `offset` is a **UTF-16 code unit offset**, not a `Character`/grapheme-cluster count --
    /// the unit `markupeditor-app/src/blocks.js`'s `blockIndexAtOffset`/`offsetForBlockIndex`
    /// were built on (JS strings are UTF-16 code unit sequences; see that file's "OFFSET UNIT
    /// DECISION" comment). This function does no unit conversion itself -- it passes `offset`
    /// through to JS as a bare numeric literal and returns whatever JS computes, unchanged.
    /// The conversion point is upstream: whoever derives `offset` from a Swift `String`
    /// position (or consumes this function's returned index to derive one) MUST measure via
    /// that string's `.utf16` view, never `String.count`/`Character`-based indexing -- Swift's
    /// grapheme-cluster counting diverges from JS's UTF-16 indexing on emoji/combining marks,
    /// silently drifting the offset on any document containing them.
    public func blockIndexAtOffset(markdownText: String, offset: Int) async -> Int? {
        await withCheckedContinuation { continuation in
            executeJavaScript("MU.blockIndexAtOffset('\(markdownText.escaped)', \(offset))") { result, error in
                if let error { Logger.webview.error("Error getting block index at offset \(offset): \(error)") }
                continuation.resume(returning: error == nil ? Self.jsInt(result) : nil)
            }
        }
    }

    /// The character offset (0-based) of the start of the `index`th top-level markdown block
    /// in `markdownText`, or `nil` on error.
    ///
    /// Returns a **UTF-16 code unit offset** -- see `blockIndexAtOffset`'s doc comment for the
    /// full rationale and the same conversion-point warning; it applies symmetrically here.
    public func offsetForBlockIndex(markdownText: String, index: Int) async -> Int? {
        await withCheckedContinuation { continuation in
            executeJavaScript("MU.offsetForBlockIndex('\(markdownText.escaped)', \(index))") { result, error in
                if let error { Logger.webview.error("Error getting offset for block index \(index): \(error)") }
                continuation.resume(returning: error == nil ? Self.jsInt(result) : nil)
            }
        }
    }

    /// Bridges a JS number result (an `NSNumber`, since `executeJavaScript` hands back `Any?`)
    /// to `Int` without force-casting. JS `null`/`undefined` bridge to `NSNull`/`nil`, neither
    /// of which satisfies either cast, so both correctly fall through to `nil` here.
    private static func jsInt(_ result: Any?) -> Int? {
        if let value = result as? Int { return value }
        if let number = result as? NSNumber { return number.intValue }
        return nil
    }

    /// Invoke the plugin registered under `name` (via `MU.runPlugin(name)`) and return its raw,
    /// undecoded result. Uses `callAsyncJavaScript` rather than the package's `executeJavaScript`
    /// wrapper, since only `callAsyncJavaScript` awaits a returned `Promise` —
    /// `executeJavaScript`/`evaluateJavaScript` hands back the live Promise object unbridged. The
    /// plugin name is passed via `arguments` rather than string interpolation, avoiding manual
    /// escaping. The `document.getElementById('markupeditor')` lookup mirrors what the package's
    /// own `executeJavaScript` wrapper does internally — not a new DOM-access mechanism, just
    /// reproduced here since that wrapper can't be used for a Promise-returning call.
    ///
    /// Decoding the JSON envelope, surfacing warnings, and converting to `Data` are the caller's job.
    public func runExporter(name: String) async -> String? {
        do {
            let result = try await callAsyncJavaScript(
                """
                const element = document.getElementById('markupeditor')
                return await element?.MU.runPlugin(name)
                """,
                arguments: ["name": name],
                contentWorld: .page
            )
            return result as? String
        } catch {
            Logger.webview.error("Error running exporter '\(name)': \(error)")
            return nil
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
    /// in `markupeditor-app.css`.
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
    private func contentEditableRect() async throws(MarkupConversionError) -> CGRect {
        let js = """
        const host = document.getElementById('markupeditor')
        const pm = host?.shadowRoot?.querySelector('.ProseMirror')
        if (!pm) return null
        return { x: pm.offsetLeft, y: pm.offsetTop, width: pm.offsetWidth, height: pm.offsetHeight }
        """
        guard let result = try? await callAsyncJavaScript(js, contentWorld: .page) as? [String: Double],
              let x = result["x"], let y = result["y"],
              let width = result["width"], let height = result["height"] else {
            throw .contentEditableNotFound
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
