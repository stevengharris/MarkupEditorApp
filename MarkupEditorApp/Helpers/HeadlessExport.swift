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
/// - `plugin <name>`: HTML on standard input; the file the named installed exporter makes on standard output.
/// - `list`: nothing on standard input; a JSON array of the installed exporters on standard output.
@MainActor
final class HeadlessExport: MarkupDelegate {

    enum Mode: Equatable {
        case html
        case pdf
        case list
        case plugin(String)
    }

    static let flag = "--headless-export"

    /// The mode named after `flag` in `arguments`, or nil when this is a normal launch or the mode is not recognized.
    static func mode(from arguments: [String]) -> Mode? {
        guard let index = arguments.firstIndex(of: flag), arguments.indices.contains(index + 1) else { return nil }
        switch arguments[index + 1] {
        case "html": return .html
        case "pdf": return .pdf
        case "list": return .list
        case "plugin":
            guard arguments.indices.contains(index + 2), !arguments[index + 2].isEmpty else { return nil }
            return .plugin(arguments[index + 2])
        default: return nil
        }
    }

    /// The installed exporters among `exporters`, as the JSON the `list` mode writes.
    static func listJSON(for exporters: [Plugin]) throws -> Data {
        try JSONEncoder().encode(InstalledExporter.installed(from: exporters))
    }

    /// Runs the conversion and exits the process; it does not return.
    static func run(_ mode: Mode) -> Never {
        if BuildVariant.isExpired() {
            FileHandle.standardError.write(Data("The MarkupEditor evaluation has expired; export is unavailable.\n".utf8))
            exit(1)
        }
        let app = NSApplication.shared
        app.setActivationPolicy(.prohibited)
        let input = String(decoding: FileHandle.standardInput.readDataToEndOfFile(), as: UTF8.self)
        let job = HeadlessExport()
        Task {
            let status = await job.perform(mode, input: input)
            exit(status)
        }
        app.run()
        exit(1)
    }

    private var webView: MarkupWKWebView?
    private var coordinator: MarkupCoordinator?
    private var window: NSWindow?
    private var loaded: CheckedContinuation<Void, Never>?

    private func perform(_ mode: Mode, input: String) async -> Int32 {
        do {
            switch mode {
            case .list:
                try Self.write(try Self.listJSON(for: AppConfig.shared.exporters))
                return 0
            case .plugin(let name):
                let installed = InstalledExporter.installed(from: AppConfig.shared.exporters)
                guard let exporter = InstalledExporter.find(name, in: installed) else {
                    throw HeadlessExportError.notInstalled(name, installed)
                }
                let source = ExporterManager.defaultDir.appendingPathComponent(exporter.filename)
                let result = try await runPlugin(exporter, source: source, html: input)
                for warning in result.warnings { Self.report("warning: \(warning)") }
                try Self.write(result.data)
                return 0
            case .html, .pdf:
                break
            }
            let webView = try await makeWebView()
            switch mode {
            case .list, .plugin:
                break
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

    /// Runs the installed exporter on `html`. A web view loads plugin files from its own cache folder, so the
    /// plugin's file is copied into a folder made for this run, which is removed afterward, before the view starts.
    /// - Parameter source: The plugin's JavaScript file.
    func runPlugin(_ exporter: InstalledExporter, source: URL, html: String) async throws -> (data: Data, warnings: [String]) {
        guard FileManager.default.fileExists(atPath: source.path(percentEncoded: false)) else {
            throw HeadlessExportError.pluginFileMissing(exporter.name)
        }
        let id = "headless-\(UUID().uuidString)"
        let cache = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0].appendingPathComponent(id)
        try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: cache) }
        try FileManager.default.copyItem(at: source, to: cache.appendingPathComponent(exporter.filename))
        let webView = try await makeWebView(id: id, pluginFiles: [exporter.filename])
        try await load(html, in: webView)
        return try await MarkupConverter.runExporterDecoded(webView, name: exporter.name)
    }

    private func makeWebView(id: String? = nil, pluginFiles: [String] = []) async throws -> MarkupWKWebView {
        let configuration = MarkupWKWebViewConfiguration()
        configuration.delegate = "MarkupEditorDelegate"
        configuration.userScriptFile = "markupeditor-app.js"
        configuration.userCssFile = "markupeditor-app.css"
        if !pluginFiles.isEmpty { configuration.pluginFiles = pluginFiles }
        await withCheckedContinuation { continuation in
            loaded = continuation
            let webView = MarkupWKWebView(id: id, markupDelegate: self, configuration: configuration)
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

enum HeadlessExportError: LocalizedError, Equatable {
    case editorUnavailable
    case notInstalled(String, [InstalledExporter])
    case pluginFileMissing(String)

    var errorDescription: String? {
        switch self {
        case .editorUnavailable: "The editor did not start."
        case .notInstalled(let name, let installed): InstalledExporter.notInstalledMessage(name, installed: installed)
        case .pluginFileMissing(let name): "The exporter \(name) is installed but its file is missing. Reinstall it from the Plugins tab."
        }
    }
}
