//
//  SourceToggleIntegrationTests.swift
//  MarkupEditorAppTests
//
//  Exercises handleToggleSource()'s Document -> Source data flow end-to-end: real
//  getSelectionBlockIndex() -> real offsetForBlockIndex() -> a real hosted SourceView
//  consuming the result. The JS-side pure functions (jsdom-mocked MU.activeView), the
//  Swift bridge against a real webview in isolation (MarkupWKWebViewHeadlessTests), and
//  SourceView's restore mechanism with a synthetic pendingOffset injected directly
//  (SourceViewSelectionTests) are each covered elsewhere, but none of them exercise this
//  data flow end-to-end. Mirrors handleToggleSource()'s exact sequence of calls (not
//  handleToggleSource() itself, which is private and tied to MarkupDocumentView's own
//  @State), so a failure here localizes a bug to the data path specifically, as opposed
//  to the visual/focus rendering of the caret in a live window, which no automated test
//  can observe.
//
//  Harness patterns (window creation/teardown, run-loop pumping) copied from
//  SourceSelectionSpikeTests.swift / SourceViewSelectionTests.swift -- see those files
//  for the full story on why: window.close() with a closable/titled styleMask can
//  SIGSEGV; RunLoop.main.run(until:) can hang the whole process when another suite has
//  concurrent async MainActor work; never let the visible-window count hit zero.
//

import Testing
import SwiftUI
import AppKit
import MarkupEditor
import MarkupEditorAppLib
@testable import MarkupEditorApp

@MainActor
private class IntegrationHeadlessPage: MarkupDelegate {
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

@Observable
@MainActor
private final class IntegrationSourceBox {
    var source: String
    var pendingOffset: Int?
    var currentOffset: Int?
    init(source: String, pendingOffset: Int? = nil) {
        self.source = source
        self.pendingOffset = pendingOffset
    }
}

@MainActor
private struct IntegrationHostedSourceView {
    let window: NSWindow
    let hostingView: NSHostingView<SourceView>
}

@MainActor
private func makeIntegrationHostedSourceView(document: MarkupDocument, box: IntegrationSourceBox) -> IntegrationHostedSourceView {
    let sourceBinding = Binding(get: { box.source }, set: { box.source = $0 })
    let pendingOffsetBinding = Binding(get: { box.pendingOffset }, set: { box.pendingOffset = $0 })
    let currentOffsetBinding = Binding(get: { box.currentOffset }, set: { box.currentOffset = $0 })

    let view = SourceView(document: .constant(document), source: sourceBinding, pendingOffset: pendingOffsetBinding, currentOffset: currentOffsetBinding)
    let hostingView = NSHostingView(rootView: view)
    hostingView.frame = NSRect(x: 0, y: 0, width: 400, height: 300)

    let window = NSWindow(
        contentRect: hostingView.frame,
        styleMask: [.titled],
        backing: .buffered,
        defer: false
    )
    window.animationBehavior = .none
    window.contentView = hostingView
    window.makeKeyAndOrderFront(nil)
    return IntegrationHostedSourceView(window: window, hostingView: hostingView)
}

@MainActor
private func integrationTeardown(_ harness: IntegrationHostedSourceView) {
    _ = harness // deliberately leaked, not ordered out/closed -- see header comment
}

@MainActor
private func integrationPumpRunLoop(seconds: TimeInterval = 0.05) async {
    try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
}

@MainActor
@Suite(.serialized) struct SourceToggleIntegrationTests {

    private static let threeParagraphMarkdown = """
    First paragraph.

    Second paragraph.

    Third paragraph.

    """

    // Mirrors handleToggleSource()'s Document -> Source sequence EXACTLY:
    //   let blockIndex = await webView.getSelectionBlockIndex()
    //   ... (setDocumentSourceFromView equivalent: we already have the markdown text)
    //   pendingSourceOffset = await webView.offsetForBlockIndex(markdownText:index:)
    // then feeds that real, non-synthetic offset into a REAL hosted SourceView.
    @Test func documentToSourceDataFlowEndToEndProducesACorrectNonNilPendingOffset() async throws {
        let page = IntegrationHeadlessPage()
        await page.start()
        let webView = try #require(page.webView)

        let imported = try await MarkupConverter.importMarkdownDecoded(webView, content: Self.threeParagraphMarkdown)
        await withCheckedContinuation { continuation in
            webView.setHtml(imported.result) { continuation.resume() }
        }

        // Simulate "the user's cursor is in the 2nd paragraph" the way it would really
        // get there -- a live ProseMirror selection, not a hand-constructed value.
        await webView.selectBlockIndex(1)

        // Step 1 of handleToggleSource()'s Document -> Source branch, verbatim.
        let blockIndex = await webView.getSelectionBlockIndex()
        #expect(blockIndex == 1, "getSelectionBlockIndex() should report the block the user's cursor is actually in")

        let unwrappedBlockIndex = try #require(blockIndex, "if this is nil, that IS the bug: the Swift bridge cannot see the just-set live selection")

        // Step 2 (offsetForBlockIndex against the markdown that will be shown), verbatim.
        let pendingOffset = await webView.offsetForBlockIndex(markdownText: Self.threeParagraphMarkdown, index: unwrappedBlockIndex)
        #expect(pendingOffset != nil, "offsetForBlockIndex should produce a real offset from a real, non-nil block index")

        let document = MarkupDocument()
        let box = IntegrationSourceBox(source: Self.threeParagraphMarkdown, pendingOffset: pendingOffset)
        let harness = makeIntegrationHostedSourceView(document: document, box: box)
        defer { integrationTeardown(harness) }

        await integrationPumpRunLoop()

        // SourceView's own consumption -- already covered in isolation by
        // SourceViewSelectionTests, re-confirmed here against the REAL captured value.
        #expect(box.pendingOffset == nil, "pendingOffset must be consumed exactly once")
        #expect(box.currentOffset == pendingOffset, "currentOffset must reflect the real, end-to-end-derived offset -- not just a synthetic one")

        // Should land in "Second paragraph." (2nd paragraph, target of blockIndex 1),
        // not paragraph 1 or 3.
        let expectedOffset = try #require(pendingOffset)
        let startOfSecondParagraph = Self.threeParagraphMarkdown.utf16.distance(
            from: Self.threeParagraphMarkdown.utf16.startIndex,
            to: Self.threeParagraphMarkdown.range(of: "Second paragraph.")!.lowerBound.samePosition(in: Self.threeParagraphMarkdown.utf16)!
        )
        #expect(expectedOffset == startOfSecondParagraph, "sanity check on the fixture itself")
    }
}
