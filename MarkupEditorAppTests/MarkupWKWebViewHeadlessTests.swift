//
//  MarkupWKWebViewHeadlessTests.swift
//  MarkupEditorAppTests
//
//  Drives MarkupEditorAppLib's extracted importMarkdown/exportMarkdown against a real,
//  headless MarkupWKWebView -- no MarkupDocumentView, no document model, no host UI. Modeled
//  on the MarkupEditor package's own HtmlTestPage.swift (not shared code: that type lives in
//  MarkupEditor's own SharedTest target, which isn't exposed as a package product, so this is
//  a small, deliberate reimplementation of the same pattern).
//
//  Lives here, not in MarkupEditorAppLib's own test target: MU.importMarkdown is defined by
//  markupeditor-app.js, loaded as a userScript via MarkupWKWebViewConfiguration.userScriptFile --
//  resolved internally via Bundle.main. Under `swift test` (a plain SwiftPM CLI run of the
//  library's own test target), Bundle.main is the swiftpm toolchain executable itself, which
//  can never resolve app resources (confirmed empirically: returns nil). Hosted here inside the
//  real MarkupEditorApp test bundle, Bundle.main is the actual running MarkupEditor.app, which
//  already ships markupeditor-app.js/.css as real bundled resources -- the same mechanism the
//  real app itself relies on, no extra plumbing.

import Testing
import Foundation
import MarkupEditor
import MarkupEditorAppLib
@testable import MarkupEditorApp

/// Holds a MarkupWKWebView instance through to its "ready" state, headlessly -- no SwiftUI, no
/// document model. Mirrors MarkupEditor's own HtmlTestPage.swift.
@MainActor
private class HeadlessTestPage: MarkupDelegate {
    var webView: MarkupWKWebView!
    private var coordinator: MarkupCoordinator!
    private var continuation: CheckedContinuation<Void, Never>?

    func start() async {
        let configuration = MarkupWKWebViewConfiguration()
        configuration.userScriptFile = "markupeditor-app.js"
        configuration.delegate = "MarkupEditorDelegate"
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            webView = MarkupWKWebView(markupDelegate: self, configuration: configuration)
            coordinator = MarkupCoordinator(markupDelegate: self, webView: webView)
            webView.setCoordinatorConfiguration(coordinator)
        }
    }

    func markupDidLoad(_ view: MarkupWKWebView, handler: (() -> Void)?) {
        continuation?.resume()
        continuation = nil
    }
}

@MainActor
struct MarkupWKWebViewHeadlessTests {

    // Reads the actual committed test-exporter.md directly off disk -- the same fixture
    // the DocX exporter's own fidelity suite is driven from, for consistency.
    private static func testExporterMarkdown() throws -> String {
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent() // MarkupEditorAppTests/
            .deletingLastPathComponent() // repo root
        let mdURL = repoRoot.appendingPathComponent("plugins/markupeditor-exporter-docx/test/fixtures/test-exporter.md")
        return try String(contentsOf: mdURL, encoding: .utf8)
    }

    @Test func importMarkdownDecodedProducesRealHtmlFromTheRealTestDocument() async throws {
        let page = HeadlessTestPage()
        await page.start()
        let webView = try #require(page.webView)

        let markdown = try Self.testExporterMarkdown()
        let converted = try await MarkupConverter.importMarkdownDecoded(webView, content: markdown)

        #expect(converted.warnings.isEmpty)
        #expect(converted.result.contains("<h1"))
        #expect(converted.result.contains("H1 Style"))
        #expect(converted.result.contains("Strikethrough text"))
    }

    // exportMarkdown() exports the editor's LIVE document state (MU.activeView().state.doc), not
    // a passed-in string -- the Swift extension's `content:` parameter is a vestigial argument
    // the JS side (exportMarkdown() takes zero arguments) silently ignores. So a real round-trip
    // needs setHtml() to actually load content into the editor first.
    @Test func exportMarkdownDecodedRoundTripsBackToMarkdown() async throws {
        let page = HeadlessTestPage()
        await page.start()
        let webView = try #require(page.webView)

        let markdown = try Self.testExporterMarkdown()
        let imported = try await MarkupConverter.importMarkdownDecoded(webView, content: markdown)

        await withCheckedContinuation { continuation in
            webView.setHtml(imported.result) { continuation.resume() }
        }

        let exported = try await MarkupConverter.exportMarkdownDecoded(webView, content: imported.result)

        #expect(exported.warnings.isEmpty)
        #expect(exported.result.contains("H1 Style"))
    }
}
