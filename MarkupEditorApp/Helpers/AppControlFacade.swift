//
//  AppControlFacade.swift
//  MarkupEditorApp
//

import AppKit
import MarkupEditor
import MarkupEditorAppLib
internal import WebKit

/// Waits for an editor operation that reports completion through a handler, and gives up after a
/// deadline, since the editor drops a paste that arrives while another is in progress without
/// calling its handler.
@MainActor
private final class PasteCompletion {

    private var continuation: CheckedContinuation<Bool, Never>?

    static func wait(seconds: Double, start: (@escaping () -> Void) -> Void) async -> Bool {
        let completion = PasteCompletion()
        return await withCheckedContinuation { continuation in
            completion.continuation = continuation
            start { completion.finish(true) }
            Task { @MainActor in
                try? await Task.sleep(for: .seconds(seconds))
                completion.finish(false)
            }
        }
    }

    private func finish(_ value: Bool) {
        continuation?.resume(returning: value)
        continuation = nil
    }
}

/// The end-user operations, in every build.
@MainActor
struct AppControlFacade: ControlFacade {

    let control: AppControl

    /// Characters of block Markdown a read returns when the caller gives no limit; `next` says where to continue.
    static let defaultDocumentLimit = 100_000

    fileprivate func webView() throws -> MarkupWKWebView {
        guard let webView = MarkupEditor.selectedWebView else { throw ControlError("No editor web view is available") }
        return webView
    }

    /// The editor's web view, or a refusal naming the source view when that is what is showing.
    private func editorWebView(for tool: String) throws -> MarkupWKWebView {
        if control.sourceShowing {
            throw ControlError("\(tool) is not available while the source view is showing. Ask the user to switch back to the document view.")
        }
        return try webView()
    }

    private func bridged<T>(_ work: () async throws -> T) async throws -> T {
        do {
            return try await work()
        } catch {
            throw ControlError(error.localizedDescription)
        }
    }

    func bundlePath() -> String { Bundle.main.bundlePath }

    func documentContent(format: ContentFormat, from: Int?, limit: Int?) async throws -> DocumentContent {
        let document = control.document
        let hasChanges = document?.hasChanges ?? false
        let url = document?.url.map { $0.path(percentEncoded: false) }
        let type = document?.url.map { $0.pathExtension }
        if control.sourceShowing {
            return DocumentContent(view: "source", hasChanges: hasChanges, url: url, documentType: type, source: control.sourceText)
        }
        let webView = try webView()
        if format == .html {
            guard let html = await webView.getHtml() else { throw ControlError("The editor returned no HTML") }
            return DocumentContent(view: "editor", hasChanges: hasChanges, url: url, documentType: type, html: html)
        }
        let page = try await bridged { try await webView.getBlocks(from: from, limit: limit ?? Self.defaultDocumentLimit) }
        guard page.ok else { throw ControlError(page.reason ?? "The editor could not describe the document") }
        return DocumentContent(
            view: "editor", hasChanges: hasChanges, url: url, documentType: type,
            blocks: page.blocks, next: page.next, firstEditable: page.firstEditable,
            selectionBlock: await webView.getSelectionBlockIndex())
    }

    func selectionContent() async throws -> SelectionContent {
        let webView = try editorWebView(for: "get_selection")
        let state = await webView.getSelectionState()
        let blockIndex = await webView.getSelectionBlockIndex()
        var block: ContentBlock?
        if let blockIndex {
            let page = try await bridged { try await webView.getBlocks(from: blockIndex, limit: 1) }
            block = page.blocks.first
        }
        var info: [String: JSONValue] = [
            "style": .string(String(describing: state.style)),
            "list": .string(String(describing: state.list)),
            "inTable": .bool(state.isInTable),
            "inImage": .bool(state.isInImage),
            "inLink": .bool(state.isInLink),
            "canUndo": .bool(state.canUndo),
            "canRedo": .bool(state.canRedo),
        ]
        if let href = state.href { info["href"] = .string(href) }
        return SelectionContent(text: state.selection ?? "", blockIndex: blockIndex, block: block, state: .object(info))
    }

    func select(_ target: SelectionTarget) async throws -> SelectionResult {
        let webView = try editorWebView(for: "select")
        switch target {
        case .block(let index):
            let count = try await bridged { try await webView.getBlocks(from: nil, limit: 1) }.count
            guard index < count else {
                throw ControlError("select: block \(index) does not exist; the document has \(count) blocks (0 to \(count - 1))")
            }
            await webView.selectBlockIndex(index)
            return SelectionResult(found: true, blockIndex: index)
        case .text(let text, let occurrence):
            let result = try await bridged { try await webView.selectText(text, occurrence: occurrence) }
            if let reason = result.reason { throw ControlError("select: \(reason)") }
            return result
        }
    }

    func replaceBlocks(index: Int, count: Int, markdown: String, expected: [String], allowLoss: Bool) async throws -> ReplaceResult {
        _ = try editorWebView(for: "replace_blocks")
        let text = control.document?.normalizeSmartPunctuation(in: markdown) ?? markdown
        var result = try await control.edits.run {
            // The view and the document may have changed while this call waited its turn.
            let webView = try editorWebView(for: "replace_blocks")
            let document = control.document
            var result = try await bridged {
                try await webView.replaceBlocks(index: index, count: count, markdown: text, expected: expected, allowLoss: allowLoss,
                                                restrictImages: control.restrictImages, allowSpecialBlocks: !(document?.isHTMLish ?? false))
            }
            // Done here, before another call can read or save the document.
            if result.ok, let document { applyFrontMatter(of: &result, to: document) }
            return result
        }
        // A refusal that carries no data is an error; one that returns the current blocks is a reply.
        if !result.ok && result.blocks.isEmpty { throw ControlError(result.reason ?? "replace_blocks was refused") }
        return result
    }

    /// A removed metadata block must also leave the document's front matter, which saving otherwise keeps when
    /// the editor has no block. Front matter the app does not keep is reported to the assistant.
    private func applyFrontMatter(of result: inout ReplaceResult, to document: MarkupDocument) {
        if result.metadataRemoved == true { document.metadata = [] }
        guard let block = result.blocks.first(where: { $0.kind == "metadata" }) else { return }
        var lines = block.markdown.split(separator: "\n", omittingEmptySubsequences: false).map(String.init)
        if lines.first == "---" { lines.removeFirst() }
        if lines.last == "---" { lines.removeLast() }
        let yaml = lines.joined(separator: "\n")
        var problems: [String] = []
        _ = YAMLMetadata.parse(yaml, warnings: &problems)
        problems += Self.unkeptFrontMatter(yaml)
        result.warnings += problems.map { "Front matter: \($0)" }
    }

    /// What the app's YAML reader drops without saying: comments, nested mappings, anchors, aliases, tags and
    /// mappings in braces. Line numbers count from the first line of the YAML.
    private static func unkeptFrontMatter(_ yaml: String) -> [String] {
        var problems: [String] = []
        for (offset, raw) in yaml.split(separator: "\n", omittingEmptySubsequences: false).enumerated() {
            let line = String(raw)
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            if trimmed.isEmpty { continue }
            if trimmed.hasPrefix("#") {
                problems.append("the comment on line \(offset + 1) is not kept")
            } else if line.first == " " || line.first == "\t" {
                if !trimmed.hasPrefix("- ") { problems.append("the indented line \(offset + 1) is not kept; only flat key: value lines and lists are") }
            } else if let colon = trimmed.firstIndex(of: ":") {
                let value = trimmed[trimmed.index(after: colon)...].trimmingCharacters(in: .whitespaces)
                if let first = value.first, "&*{!".contains(first) {
                    problems.append("line \(offset + 1) uses an anchor, alias, tag or mapping in braces, which is not kept")
                }
            }
        }
        return problems
    }

    func undo() async throws {
        _ = try editorWebView(for: "undo")
        try await control.edits.run {
            let webView = try editorWebView(for: "undo")
            guard await webView.getSelectionState().canUndo else { throw ControlError("There is nothing to undo") }
            await webView.undo()
        }
    }

    func redo() async throws {
        _ = try editorWebView(for: "redo")
        try await control.edits.run {
            let webView = try editorWebView(for: "redo")
            guard await webView.getSelectionState().canRedo else { throw ControlError("There is nothing to redo") }
            await webView.redo()
        }
    }

    func saveDocument() async throws -> URL {
        try await control.edits.run {
            // Checked when this call's turn comes, so edits queued ahead of it are already applied.
            guard !control.sourceShowing else {
                throw ControlError("save_document is not available while the source view is showing. Ask the user to switch back to the document view.")
            }
            guard let document = control.document else { throw ControlError("No document is open") }
            guard let url = document.url else {
                throw ControlError("The document has not been saved yet, so it has no file to save to. Ask the user to save it first.")
            }
            guard document.hasChanges else { throw ControlError("The document has no unsaved changes") }
            control.requestSave()
            for _ in 0..<50 where document.hasChanges {
                try await Task.sleep(for: .milliseconds(100))
            }
            if document.hasChanges { throw ControlError("The save did not complete; the document still has unsaved changes") }
            return url
        }
    }
}

#if DEBUG
/// Debug builds only: the broader control used for testing and demos.
extension AppControlFacade: DeveloperControlFacade {

    private static let menuCommands: [String: Notification.Name] = [
        "new": .menuNewDocument,
        "open": .menuOpenDocument,
        "save": .menuSaveDocument,
        "saveAs": .menuSaveAsDocument,
        "toggleSource": .menuToggleSource,
        "showSettings": .menuShowSettings,
    ]

    func appState() async throws -> JSONValue {
        let document = control.document
        var state: [String: JSONValue] = [
            "url": document?.url.map { .string($0.path(percentEncoded: false)) } ?? .null,
            "hasChanges": .bool(document?.hasChanges ?? false),
            "documentType": document?.url.map { .string($0.pathExtension) } ?? .null,
            "sourceShowing": .bool(control.sourceShowing),
            "hasWebView": .bool(MarkupEditor.selectedWebView != nil),
            "bundlePath": .string(Bundle.main.bundlePath),
        ]
        state["appHidden"] = .bool(NSApp.isHidden)
        state["appActive"] = .bool(NSApp.isActive)
        state["modalWindow"] = .string(NSApp.modalWindow.map { String(describing: type(of: $0)) } ?? "")
        state["windows"] = .array(NSApp.windows.map { window in
            [
                "id": .string(window.identifier?.rawValue ?? ""),
                "title": .string(window.title),
                "visible": .bool(window.isVisible),
                "key": .bool(window.isKeyWindow),
                "miniaturized": .bool(window.isMiniaturized),
                "occluded": .bool(!window.occlusionState.contains(.visible)),
                "delegate": .string(window.delegate.map { String(describing: type(of: $0)) } ?? "nil"),
            ]
        })
        return .object(state)
    }

    /// The regenerated Markdown, not the preserved text a save would write.
    func markdown() async throws -> String {
        let webView = try webView()
        guard let html = await webView.getHtml() else { throw ControlError("The editor returned no HTML") }
        guard let document = control.document, !document.isHTMLish else { return html }
        var warnings: [String] = []
        document.syncMetadata(fromHTML: html, warnings: &warnings)
        do {
            let body = try await MarkupConverter.exportMarkdownDecoded(webView, content: html).result
            return document.injectYAMLFrontMatter(into: body)
        } catch {
            throw ControlError(error.localizedDescription)
        }
    }

    /// Inserts `text` as text. The editor parses what it is pasted as HTML, so markup characters are
    /// escaped to arrive literally.
    func typeText(_ text: String) async throws {
        let webView = try webView()
        webView.window?.makeFirstResponder(webView)
        let escaped = text
            .replacingOccurrences(of: "&", with: "&amp;")
            .replacingOccurrences(of: "<", with: "&lt;")
            .replacingOccurrences(of: ">", with: "&gt;")
        let finished = await PasteCompletion.wait(seconds: 10) { done in webView.pasteText(escaped, handler: done) }
        guard finished else { throw ControlError("The editor did not finish the edit; it may be busy with another paste. Try again.") }
    }

    func runMenuCommand(_ name: String) async throws {
        if name == "hideApp" {
            NSApp.hide(nil)
            return
        }
        if name == "minimizeWindow" {
            NSApp.windows.first { $0.identifier?.rawValue == MarkupEditorApp.mainWindowID }?.miniaturize(nil)
            return
        }
        if name == "closeWindow" {
            // Clicks the real close button, so its retargeted action is what runs.
            NSApp.windows.first { $0.identifier?.rawValue == MarkupEditorApp.mainWindowID }?.standardWindowButton(.closeButton)?.performClick(nil)
            return
        }
        guard let notification = Self.menuCommands[name] else {
            throw ControlError("Unknown menu command '\(name)'. Use one of: closeWindow, \(Self.menuCommands.keys.sorted().joined(separator: ", "))")
        }
        let sourceWasShowing = control.sourceShowing
        NotificationCenter.default.post(name: notification, object: nil)
        // The handler runs asynchronously; wait for the visible effect so a following read is current.
        guard name == "toggleSource" else { return }
        for _ in 0..<30 where control.sourceShowing == sourceWasShowing {
            try await Task.sleep(for: .milliseconds(100))
        }
        if control.sourceShowing == sourceWasShowing { throw ControlError("The source view did not change within 3 seconds") }
    }

    func evalJS(_ script: String) async throws -> JSONValue {
        do {
            return Self.json(try await webView().evaluateJavaScript(script))
        } catch let error as NSError {
            let detail = error.userInfo["WKJavaScriptExceptionMessage"] as? String
            throw ControlError(detail.map { "JavaScript error: \($0)" } ?? error.localizedDescription)
        }
    }

    func html() async throws -> String {
        guard let html = await (try webView()).getHtml() else { throw ControlError("The editor returned no HTML") }
        return html
    }

    func screenshotEditor() async throws -> Data {
        let image = try await webView().takeSnapshot(configuration: nil)
        guard let tiff = image.tiffRepresentation,
              let png = NSBitmapImageRep(data: tiff)?.representation(using: .png, properties: [:]) else {
            throw ControlError("Could not encode the snapshot as PNG")
        }
        return png
    }

    /// A JSON value for what `evaluateJavaScript` returns.
    static func json(_ value: Any?) -> JSONValue {
        switch value {
        case nil, is NSNull:
            return .null
        case let number as NSNumber:
            return CFGetTypeID(number) == CFBooleanGetTypeID() ? .bool(number.boolValue) : .number(number.doubleValue)
        case let string as String:
            return .string(string)
        case let array as [Any]:
            return .array(array.map { json($0) })
        case let dictionary as [String: Any]:
            return .object(dictionary.mapValues { json($0) })
        default:
            return .string(String(describing: value))
        }
    }
}
#endif
