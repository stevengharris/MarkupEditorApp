//
//  HeadlessExport.swift
//  MarkupEditorApp
//

import AppKit
import Foundation
import MarkupEditor
import MarkupEditorAppLib

/// A launch of the app that converts without showing any UI, run by the `markup export` command as a
/// child process. The app is sandboxed, so the CLI, which can read and write any path, owns every
/// file and the app sees only the inherited pipes; warnings and errors go to standard error.
///
/// - `html`: Markdown on standard input; a JSON object `{"html": ..., "srcs": [...]}` on standard
///   output, where `srcs` are the document's local image sources as the editor reports them.
/// - `pdf`: HTML on standard input; the PDF on standard output.
@MainActor
final class HeadlessExport: MarkupDelegate {

    enum Format: String {
        case html
        case pdf
    }

    static let flag = "--headless-export"

    /// The format named after `flag` in `arguments`, or nil when this is a normal launch.
    static func format(from arguments: [String]) -> Format? {
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        return Format(rawValue: arguments[index + 1])
    }

    /// Runs the conversion and exits the process; it does not return.
    static func run(_ format: Format) -> Never {
        if BuildVariant.isExpired() {
            FileHandle.standardError.write(Data("The MarkupEditor evaluation has expired; export is unavailable.\n".utf8))
            exit(1)
        }
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let input = String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self)
        let job = HeadlessExport()
        Task {
            let status = await job.perform(format, input: input)
            exit(status)
        }
        app.run()
        exit(1)
    }

    private var webView: MarkupWKWebView?
    private var coordinator: MarkupCoordinator?
    private var window: NSWindow?
    private var loaded: CheckedContinuation<Void, Never>?

    private func perform(_ format: Format, input: String) async -> Int32 {
        do {
            let webView = try await makeWebView()
            switch format {
            case .html:
                let converted = try await MarkupConverter.importMarkdownDecoded(webView, content: input)
                for warning in converted.warnings { Self.report("warning: \(warning)") }
                try await load(converted.result, in: webView)
                let html = await webView.tightenHtml(converted.result) ?? converted.result
                let reply = Reply(html: html, srcs: await webView.getLocalImages())
                try Self.write(try JSONEncoder().encode(reply))
            case .pdf:
                try await showInWindow(webView)
                try await load(input, in: webView)
                try Self.write(try await webView.exportPDF())
            }
            return 0
        } catch {
            Self.report("error: \(error.localizedDescription)")
            return 1
        }
    }

    /// What the `html` format writes.
    struct Reply: Codable {
        let html: String
        let srcs: [String]
    }

    private func makeWebView() async throws -> MarkupWKWebView {
        let configuration = MarkupWKWebViewConfiguration()
        configuration.delegate = "MarkupEditorDelegate"
        configuration.userScriptFile = "markupeditor-app.js"
        configuration.userCssFile = "markupeditor-app.css"
        await withCheckedContinuation { continuation in
            loaded = continuation
            let webView = MarkupWKWebView(markupDelegate: self, configuration: configuration)
            let coordinator = MarkupCoordinator(markupDelegate: self, webView: webView)
            webView.setCoordinatorConfiguration(coordinator)
            self.webView = webView
            self.coordinator = coordinator
        }
        guard let webView else { throw HeadlessExportError.editorUnavailable }
        return webView
    }

    /// Puts `webView` in an offscreen window, because printing needs one.
    private func showInWindow(_ webView: MarkupWKWebView) async throws {
        let window = NSWindow(
            contentRect: NSRect(x: -20_000, y: -20_000, width: 800, height: 1000),
            styleMask: [.titled], backing: .buffered, defer: false)
        window.contentView = webView
        window.orderBack(nil)
        self.window = window
    }

    private func load(_ html: String, in webView: MarkupWKWebView) async throws {
        await withCheckedContinuation { continuation in
            webView.setHtml(html) { continuation.resume() }
        }
    }

    private static func write(_ data: Data) throws {
        try FileHandle.standardOutput.write(contentsOf: data)
    }

    private static func report(_ message: String) {
        try? FileHandle.standardError.write(contentsOf: Data((message + "\n").utf8))
    }

    func markupDidLoad(_ view: MarkupWKWebView, handler: (() -> Void)?) {
        loaded?.resume()
        loaded = nil
    }
}

enum HeadlessExportError: LocalizedError {
    case editorUnavailable

    var errorDescription: String? {
        switch self {
        case .editorUnavailable: "The editor did not start."
        }
    }
}
