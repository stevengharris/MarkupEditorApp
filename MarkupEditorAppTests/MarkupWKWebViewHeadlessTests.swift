//
//  MarkupWKWebViewHeadlessTests.swift
//  MarkupEditorAppTests
//
//  Drives MarkupEditorAppLib's extracted importMarkdown/exportMarkdown, plus its four
//  block-index bridge functions (getSelectionBlockIndex/selectBlockIndex/blockIndexAtOffset/
//  offsetForBlockIndex, MarkupWKWebView+Extension.swift), against a real, headless
//  MarkupWKWebView -- no MarkupDocumentView, no document model, no host UI. Modeled
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
        let mdURL = repoRoot.appendingPathComponent("plugins/exporter-docx/test/fixtures/test-exporter.md")
        return try String(contentsOf: mdURL, encoding: .utf8)
    }

    // A small, precisely-known 5-paragraph document (top-level indices 0...4) -- deliberately
    // simpler than test-exporter.md so block-index round-trips have an unambiguous expected shape,
    // rather than depending on that fixture's nested lists/tables to reason about top-level count.
    private static let fiveParagraphMarkdown = """
    First paragraph.

    Second paragraph.

    Third paragraph.

    Fourth paragraph.

    Fifth paragraph.

    """

    /// Load `markdown` into a fresh headless page and return the ready webView.
    private static func loadedPage(_ markdown: String) async throws -> MarkupWKWebView {
        let page = HeadlessTestPage()
        await page.start()
        let webView = try #require(page.webView)
        let imported = try await MarkupConverter.importMarkdownDecoded(webView, content: markdown)
        await withCheckedContinuation { continuation in
            webView.setHtml(imported.result) { continuation.resume() }
        }
        return webView
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

    // getSelectionBlockIndex()/selectBlockIndex(_:) (MarkupWKWebView+Extension.swift)
    // against a REAL, live ProseMirror view -- the unit-level coverage in
    // markupeditor-app/test/blocks.test.js exercises the underlying MU.* functions against
    // jsdom-mocked MU.activeView(); this is the test that would catch the mock shape not
    // matching what a real WKWebView-hosted view actually returns. Calls go through the typed
    // Swift bridge itself now, not raw executeJavaScript -- also exercises the bridge's own
    // NSNumber-to-Int decoding.

    @Test func selectBlockIndexRoundTripsForEveryTopLevelParagraph() async throws {
        let webView = try await Self.loadedPage(Self.fiveParagraphMarkdown)

        for n in 0...4 {
            await webView.selectBlockIndex(n)
            let observed = await webView.getSelectionBlockIndex()
            #expect(observed == n, "selectBlockIndex(\(n)) followed by getSelectionBlockIndex() should return \(n)")
        }
    }

    @Test func defaultPostLoadSelectionIsASaneBlockIndex() async throws {
        let webView = try await Self.loadedPage(Self.fiveParagraphMarkdown)

        let observed = await webView.getSelectionBlockIndex()
        let index = try #require(observed)
        #expect((0...4).contains(index), "default selection block index \(index) should be within the document's 5 top-level blocks")
    }

    @Test func outOfRangeSelectBlockIndexDoesNotThrowAndLeavesAValidSelection() async throws {
        let webView = try await Self.loadedPage(Self.fiveParagraphMarkdown)

        await webView.selectBlockIndex(-1)
        let afterNegative = try #require(await webView.getSelectionBlockIndex())
        #expect((0...4).contains(afterNegative))

        await webView.selectBlockIndex(100)
        let afterTooLarge = try #require(await webView.getSelectionBlockIndex())
        #expect((0...4).contains(afterTooLarge))
    }

    // Exercises the composed "restore target document actually changed" scenario:
    // every other test here captures and restores against the SAME loaded document.
    // This one drives the actual live ProseMirror view through a genuine document swap
    // on the SAME webview, the way a real edit-then-toggle would (markupeditor-app/
    // test/blocks.test.js has the equivalent pure-JS version, composing
    // offsetForBlockIndex/blockIndexAtOffset across two different doc texts).
    @Test func selectBlockIndexFollowedByLoadingADifferentDocumentDoesNotCrashOrMisbehave() async throws {
        let webView = try await Self.loadedPage(Self.fiveParagraphMarkdown) // 5 blocks

        // Select a block valid for the currently-loaded 5-paragraph document.
        await webView.selectBlockIndex(3)
        let beforeReload = await webView.getSelectionBlockIndex()
        #expect(beforeReload == 3)

        // Load a genuinely DIFFERENT, SHORTER document on the SAME webview -- the
        // "restore target document actually changed" scenario -- and confirm it
        // doesn't throw or leave the webview broken.
        let differentMarkdown = "First.\n\nSecond.\n"
        let imported = try await MarkupConverter.importMarkdownDecoded(webView, content: differentMarkdown)
        await withCheckedContinuation { continuation in
            webView.setHtml(imported.result) { continuation.resume() }
        }

        // The webview must still be alive and responsive -- a sane, in-range selection
        // for the NEW (2-block) document, not a crash and not a leftover selection
        // referencing the old document's structure.
        let afterReload = try #require(await webView.getSelectionBlockIndex())
        #expect((0...1).contains(afterReload), "selection block index after reloading a shorter document should be within its 2 top-level blocks")

        // Confirm the webview still responds correctly to further selectBlockIndex
        // calls after the document swap, including an index that was valid for the OLD
        // (5-block) document but is out of range for the NEW (2-block) one -- must
        // clamp, not crash.
        await webView.selectBlockIndex(4)
        let afterOutOfRangeSelect = try #require(await webView.getSelectionBlockIndex())
        #expect((0...1).contains(afterOutOfRangeSelect))
    }

    // blockIndexAtOffset(markdownText:offset:)/offsetForBlockIndex(markdownText:index:)
    // (MarkupWKWebView+Extension.swift) against the REAL live bundle. These two are pure
    // markdown-text functions with no dependency on loaded document state (they never touch
    // MU.activeView()), so a freshly-started, unloaded webView is enough to call them.

    @Test func blockIndexAtOffsetAndOffsetForBlockIndexRoundTripAgainstTheRealBundle() async throws {
        let page = HeadlessTestPage()
        await page.start()
        let webView = try #require(page.webView)

        for n in 0...4 {
            let offset = try #require(await webView.offsetForBlockIndex(markdownText: Self.fiveParagraphMarkdown, index: n))
            let observed = try #require(await webView.blockIndexAtOffset(markdownText: Self.fiveParagraphMarkdown, offset: offset))
            #expect(observed == n, "offsetForBlockIndex(\(n)) -> \(offset) -> blockIndexAtOffset should round-trip to \(n)")
        }
    }

    // Confirms the UTF-16-code-unit offset unit holds against the REAL live bundle, not just
    // the markupeditor-app vitest suite -- an emoji (surrogate pair, 2 UTF-16 code units) in an
    // earlier block must not skew a later block's offset. JS's `.length` and Swift's
    // `NSNumber`-bridged Int here both operate in the same UTF-16 code unit space; this test
    // does no Character-based counting on the Swift side, matching the doc comment on
    // blockIndexAtOffset.
    @Test func blockIndexAtOffsetHandlesNonBMPCharactersAgainstTheRealBundle() async throws {
        let page = HeadlessTestPage()
        await page.start()
        let webView = try #require(page.webView)

        let markdown = "# Heading with emoji \u{1F389}\n\nParagraph after the emoji block.\n"

        let paragraphOffset = try #require(await webView.offsetForBlockIndex(markdownText: markdown, index: 1))
        let observed = try #require(await webView.blockIndexAtOffset(markdownText: markdown, offset: paragraphOffset))
        #expect(observed == 1)
    }
}
