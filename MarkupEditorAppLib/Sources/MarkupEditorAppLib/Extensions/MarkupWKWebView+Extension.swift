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

    /// Invoke the exporter registered under `name` (via `MU.runPlugin(name)`) and return its raw,
    /// undecoded result, or the names of the exporters that are registered when none is under
    /// `name` (`runPlugin` alone returns null for an unknown name, which can't be told apart from
    /// a plugin that returned nothing).
    ///
    /// Uses `callAsyncJavaScript` rather than the package's `executeJavaScript` wrapper, since
    /// only `callAsyncJavaScript` awaits a returned `Promise` —
    /// `executeJavaScript`/`evaluateJavaScript` hands back the live Promise object unbridged. The
    /// plugin name is passed via `arguments` rather than string interpolation, avoiding manual
    /// escaping. The `document.getElementById('markupeditor')` lookup mirrors what the package's
    /// own `executeJavaScript` wrapper does internally — not a new DOM-access mechanism, just
    /// reproduced here since that wrapper can't be used for a Promise-returning call.
    ///
    /// Decoding the JSON envelope, surfacing warnings, and converting to `Data` are the caller's job.
    public func runExporter(name: String) async -> ExporterRun {
        do {
            let result = try await callAsyncJavaScript(
                """
                const MU = document.getElementById('markupeditor')?.MU
                if (!MU) return null
                const registered = MU.getPlugins('exporter').map((plugin) => plugin.name).filter((n) => typeof n === 'string')
                if (!registered.includes(name)) return { notRegistered: registered }
                return { result: await MU.runPlugin(name) }
                """,
                arguments: ["name": name],
                contentWorld: .page
            )
            return ExporterRun(script: result)
        } catch {
            Logger.webview.error("Error running exporter '\(name)': \(error)")
            return .noResult
        }
    }

    /// Export the document as PDF data, paginated by a print operation without panels. A focused editor
    /// shows selection/focus chrome (caret, node-selected outlines, resize handles, the code-block
    /// language tab, other codeview tabs), and the toolbar and search bar are in the page; the
    /// `Markup-exporting` class on `#editor` hides all of it, and every override lives in `markupeditor-app.css`.
    public func exportPDF() async throws -> Data {
        await setExporting(true)
        do {
            let data = try await printedPDF()
            await setExporting(false)
            return data
        } catch {
            await setExporting(false)
            throw error
        }
    }

    /// The document paginated by WebKit print layout onto the print system's default paper, saved to a
    /// temporary file by a print operation that shows no panels.
    private func printedPDF() async throws -> Data {
        guard let window else { throw MarkupConversionError.unableToExportPDF }
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".pdf")
        defer { try? FileManager.default.removeItem(at: url) }
        let info = NSPrintInfo(dictionary: [
            .jobDisposition: NSPrintInfo.JobDisposition.save,
            .jobSavingURL: url,
        ])
        let operation = printOperation(with: info)
        operation.showsPrintPanel = false
        operation.showsProgressPanel = false
        operation.view?.frame = NSRect(origin: .zero, size: info.paperSize)
        guard await PrintRunner().run(operation, in: window) else { throw MarkupConversionError.unableToExportPDF }
        return try Data(contentsOf: url)
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

// MARK: Block-addressed content

extension MarkupWKWebView {

    /// The document's top-level blocks from `MU.getBlocks`, starting at block `from` and stopping before
    /// the block that would pass `limit` characters of Markdown (always at least one block).
    public func getBlocks(from: Int?, limit: Int?) async throws(ContentBridgeError) -> BlocksReply {
        let call = "MU.getBlocks(\(from.map(String.init) ?? "undefined"), \(limit.map(String.init) ?? "undefined"))"
        return try BlocksReply.decode(await runBlockFunction(call, name: "getBlocks"))
    }

    /// Replace, insert or delete blocks through `MU.replaceBlocks`. Unless `restrictImages` is false, an image
    /// without a relative source is turned into a link. A refusal comes back as a result with `ok` false; only
    /// a failure to reach or read the editor throws.
    public func replaceBlocks(index: Int, count: Int, markdown: String, expected: [String], allowLoss: Bool, restrictImages: Bool = true) async throws(ContentBridgeError) -> ReplaceResult {
        let call = "MU.replaceBlocks(\(index), \(count), \(Self.jsLiteral(markdown)), \(Self.jsLiteral(expected)), \(allowLoss), \(restrictImages))"
        return try ReplaceResult.decode(await runBlockFunction(call, name: "replaceBlocks"))
    }

    /// Select the `occurrence`th match of `text` (case-insensitive, counted from the document start) through
    /// `MU.selectText`. Nothing changes when there is no match.
    public func selectText(_ text: String, occurrence: Int) async throws(ContentBridgeError) -> SelectionResult {
        let call = "MU.selectText(\(Self.jsLiteral(text)), \(occurrence))"
        return try SelectionResult.decode(await runBlockFunction(call, name: "selectText"))
    }

    /// Offer suggested edits to the user through `MU.proposeEdits`; the document is not changed. A refusal of one edit
    /// is in the result, and so is a refusal of the whole call (`ok` false); only a failure to reach or read the editor throws.
    public func proposeEdits(_ edits: [SuggestedEdit]) async throws(ContentBridgeError) -> ProposeResult {
        let call = "MU.proposeEdits(\(Self.jsLiteral(edits)))"
        return try ProposeResult.decode(await runBlockFunction(call, name: "proposeEdits"))
    }

    /// Every suggestion made this session, with its status, from `MU.listSuggestions`.
    public func listSuggestions() async throws(ContentBridgeError) -> SuggestionList {
        try SuggestionList.decode(await runBlockFunction("MU.listSuggestions()", name: "listSuggestions"))
    }

    /// The JSON encoding of `value`, which is also a JavaScript literal, so no argument needs hand escaping.
    static func jsLiteral<T: Encodable>(_ value: T) -> String {
        guard let data = try? JSONEncoder().encode(value), let text = String(data: data, encoding: .utf8) else { return "null" }
        return text
    }

    /// The JSON text the editor function returned, or `nil` when the call failed or returned something else.
    private func runBlockFunction(_ call: String, name: String) async -> String? {
        await withCheckedContinuation { continuation in
            executeJavaScript(call) { result, error in
                if let error { Logger.webview.error("Error running \(name): \(error)") }
                continuation.resume(returning: error == nil ? result as? String : nil)
            }
        }
    }
}

/// Runs a print operation as a sheet on a window and reports whether it succeeded.
private final class PrintRunner: NSObject {
    private var continuation: CheckedContinuation<Bool, Never>?

    @MainActor
    func run(_ operation: NSPrintOperation, in window: NSWindow) async -> Bool {
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            operation.runModal(for: window, delegate: self, didRun: #selector(printOperationDidRun(_:success:contextInfo:)), contextInfo: nil)
        }
    }

    @objc private func printOperationDidRun(_ operation: NSPrintOperation, success: Bool, contextInfo: UnsafeMutableRawPointer?) {
        continuation?.resume(returning: success)
        continuation = nil
    }
}
