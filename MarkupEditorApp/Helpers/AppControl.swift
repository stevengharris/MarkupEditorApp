//
//  AppControl.swift
//  MarkupEditorApp
//

#if DEBUG
import AppKit
import MarkupEditor
import MarkupEditorAppLib
import os
internal import WebKit

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "Control")

/// Debug builds only. Listens on a socket inside the app container so an MCP client, through
/// `markup mcp`, can inspect and drive the running app.
@MainActor
final class AppControl {

    static let shared = AppControl()

    /// The document being edited, registered by the document view.
    var document: MarkupDocument?
    var sourceShowing = false

    private var server: ControlServer?

    func start() {
        guard server == nil else { return }
        let dispatcher = ControlDispatcher(facade: AppControlFacade(control: self))
        let server = ControlServer(path: ControlClient.appPath(containerHome: NSHomeDirectory())) { line in
            await dispatcher.handle(line)
        }
        do {
            try server.start()
            self.server = server
        } catch {
            logger.error("Control channel not started: \(error.localizedDescription, privacy: .public)")
        }
    }
}

@MainActor
struct AppControlFacade: ControlFacade {

    let control: AppControl

    private static let menuCommands: [String: Notification.Name] = [
        "new": .menuNewDocument,
        "open": .menuOpenDocument,
        "save": .menuSaveDocument,
        "saveAs": .menuSaveAsDocument,
        "toggleSource": .menuToggleSource,
        "showSettings": .menuShowSettings,
    ]

    private func webView() throws -> MarkupWKWebView {
        guard let webView = MarkupEditor.selectedWebView else { throw ControlError("No editor web view is available") }
        return webView
    }

    func appState() async throws -> JSONValue {
        let document = control.document
        return [
            "url": document?.url.map { .string($0.path(percentEncoded: false)) } ?? .null,
            "hasChanges": .bool(document?.hasChanges ?? false),
            "documentType": document?.url.map { .string($0.pathExtension) } ?? .null,
            "sourceShowing": .bool(control.sourceShowing),
            "hasWebView": .bool(MarkupEditor.selectedWebView != nil),
            "bundlePath": .string(Bundle.main.bundlePath),
            "appHidden": .bool(NSApp.isHidden),
            "appActive": .bool(NSApp.isActive),
            "modalWindow": .string(NSApp.modalWindow.map { String(describing: type(of: $0)) } ?? ""),
            "windows": .array(NSApp.windows.map { window in
                [
                    "id": .string(window.identifier?.rawValue ?? ""),
                    "title": .string(window.title),
                    "visible": .bool(window.isVisible),
                    "key": .bool(window.isKeyWindow),
                    "delegate": .string(window.delegate.map { String(describing: type(of: $0)) } ?? "nil"),
                    "miniaturized": .bool(window.isMiniaturized),
                    "occluded": .bool(!window.occlusionState.contains(.visible)),
                ]
            }),
        ]
    }

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

    func html() async throws -> String {
        guard let html = await (try webView()).getHtml() else { throw ControlError("The editor returned no HTML") }
        return html
    }

    func typeText(_ text: String) async throws {
        let webView = try webView()
        webView.window?.makeFirstResponder(webView)
        await withCheckedContinuation { continuation in
            webView.pasteText(text) { continuation.resume() }
        }
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
