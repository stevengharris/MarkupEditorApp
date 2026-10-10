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

    fileprivate func webView() throws -> MarkupWKWebView {
        guard let webView = MarkupEditor.selectedWebView else { throw ControlError("No editor web view is available") }
        return webView
    }

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
#if DEBUG
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
#endif
        return .object(state)
    }

    func bundlePath() -> String { Bundle.main.bundlePath }

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

    func selectionText() async throws -> String {
        await (try webView()).getSelectionState().selection ?? ""
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

    func saveDocument() async throws {
        guard let document = control.document else { throw ControlError("No document is open") }
        guard document.hasChanges else { return }
        NotificationCenter.default.post(name: .menuSaveDocument, object: nil)
        for _ in 0..<50 where document.hasChanges {
            try await Task.sleep(for: .milliseconds(100))
        }
        if document.hasChanges { throw ControlError("The document still has unsaved changes after 5 seconds") }
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
