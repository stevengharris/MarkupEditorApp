//
//  PreserveSourceIntegrationTests.swift
//  MarkupEditorAppTests
//
//  Saving a Markdown document rewrites only the blocks that changed. These tests repeat the call
//  sequences MarkupDocumentView runs for open, the source view toggle, an editor rebuild and save
//  against real web views; the view's handlers are private, so the sequences are mirrored here
//  rather than invoked. A replacement web view stands in for the one SwiftUI recreates.
//

import Testing
import Foundation
import MarkupEditor
import MarkupEditorAppLib
@testable import MarkupEditorApp

@MainActor
private final class PreserveSession {
    let document = MarkupDocument()
    private(set) var webView: MarkupWKWebView
    private var pages: [HeadlessTestPage]
    let directory: URL

    private init(page: HeadlessTestPage, webView: MarkupWKWebView) {
        self.pages = [page]
        self.webView = webView
        directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    }

    static func make() async throws -> PreserveSession {
        let page = HeadlessTestPage()
        await page.start()
        let session = PreserveSession(page: page, webView: try #require(page.webView))
        try FileManager.default.createDirectory(at: session.directory, withIntermediateDirectories: true)
        return session
    }

    /// As openMd(at:): import, record the document, load the editor, rebase.
    func open(_ text: String) async throws {
        let url = directory.appendingPathComponent("original.md")
        try Data(text.utf8).write(to: url)
        let (html, metadata) = try await importMarkdown(text)
        try document.openMd(at: url, baseUrl: webView.baseUrl, markdown: text, metadata: metadata)
        await load(document.seedMetadataBlock(in: html), into: webView)
        await rebase()
    }

    /// As the markupDidLoad and post-save rebases.
    func rebase() async {
        guard let baseText = document.baseText else { return }
        let result = await MarkupConverter.rebaseSourceDecoded(webView, baseText: baseText)
        guard document.baseText == baseText else { return }
        document.applyRebase(tag: result.tag, frontMatter: result.frontMatter)
    }

    /// The complete Markdown for the editor's current content, as the source view and save produce it.
    func currentMarkdown() async throws -> String {
        let html = try #require(await webView.getHtml())
        var warnings: [String] = []
        document.syncMetadata(fromHTML: html, warnings: &warnings)
        let options = MarkdownExportOptions.preserving(tag: document.sourceMapTag)
        let body = try await MarkupConverter.exportMarkdownDecoded(webView, content: html, options: options).result
        return document.injectYAMLFrontMatter(into: body, preserve: true)
    }

    /// As setCurrentHtmlFromSource(): the source text becomes the base text, the editor is recreated
    /// from it, and the new view rebases.
    func returnFromSource(_ source: String) async throws {
        document.setBaseText(source)
        let (html, metadata) = try await importMarkdown(source)
        document.metadata = metadata
        try await replaceView(with: document.seedMetadataBlock(in: html))
        await rebase()
    }

    /// As reloadEditorForConfigChange(): the live content moves to a new view, which rebases from the
    /// document's base text.
    func rebuild() async throws {
        let html = try #require(await webView.getHtml())
        try await replaceView(with: html)
        await rebase()
    }

    /// Replaces `old` with `new` in the editor content, as a user edit would.
    func edit(replacing old: String, with new: String) async throws {
        let html = try #require(await webView.getHtml())
        try #require(html.contains(old))
        await load(html.replacingOccurrences(of: old, with: new), into: webView)
        document.hasChanges = true
    }

    /// As handleNew(): the view is reused and the document reset.
    func newDocument() async {
        await webView.emptyDocument()
        document.setSource("", documentType: .md)
        document.reset()
    }

    /// As openHtml(at:): the view is reused; the document drops its Markdown base.
    func openHtml(_ html: String) async throws {
        let url = directory.appendingPathComponent("original.html")
        try Data(html.utf8).write(to: url)
        let loaded = try document.openHtml(at: url, baseUrl: webView.baseUrl)
        await load(loaded, into: webView)
    }

    /// Puts `html` in the editor as typed or pasted content.
    func setContent(_ html: String) async {
        await load(html, into: webView)
        document.hasChanges = true
    }

    /// As handleSave(newURL): the bytes written to a new file.
    func saveAs(_ name: String = "saved.md") async throws -> Data {
        let url = directory.appendingPathComponent(name)
        document.url = url
        let markdown = try await currentMarkdown()
        try document.saveMd(markdown: markdown, to: url, srcs: [], baseUrl: webView.baseUrl)
        await rebase()
        return try Data(contentsOf: url)
    }

    private func importMarkdown(_ text: String) async throws -> (html: String, metadata: [MetadataTuple]) {
        let converted = try await MarkupConverter.importMarkdownDecoded(webView, content: text)
        var warnings: [String] = []
        let metadata = converted.metadata.map { YAMLMetadata.parse($0, warnings: &warnings) } ?? []
        return (converted.result, metadata)
    }

    private func replaceView(with html: String) async throws {
        let page = HeadlessTestPage()
        await page.start()
        pages.append(page)
        webView = try #require(page.webView)
        await load(html, into: webView)
    }

    private func load(_ html: String, into webView: MarkupWKWebView) async {
        await withCheckedContinuation { continuation in
            webView.setHtml(html) { continuation.resume() }
        }
    }
}

@MainActor
@Suite(.serialized) struct PreserveSourceIntegrationTests {

    private static let styled = "Title\n=====\n\nA hard wrapped\nparagraph here.\n\n* one\n* two\n\nSecond paragraph.\n"
    private static let curly = "Say “hi” and it’s ‘fine’.\n\nSecond paragraph.\n"

    @Test func sourceViewRoundTripWithoutEditSavesTheFile() async throws {
        let session = try await PreserveSession.make()
        try await session.open(Self.styled)
        let source = try await session.currentMarkdown()
        #expect(source == Self.styled)
        try await session.returnFromSource(source)
        session.document.hasChanges = true
        #expect(try await session.saveAs() == Data(Self.styled.utf8))
    }

    @Test func sourceViewEditChangesOnlyTheEditedBlock() async throws {
        let session = try await PreserveSession.make()
        try await session.open(Self.styled)
        #expect(try await session.currentMarkdown() == Self.styled)
        // Restyling the list is invisible to the editor content, so only a base text that includes the
        // edit keeps the dashes.
        let edited = Self.styled
            .replacingOccurrences(of: "Second paragraph.", with: "Second paragraph, edited.")
            .replacingOccurrences(of: "* one\n* two", with: "- one\n- two")
        try await session.returnFromSource(edited)
        session.document.hasChanges = true
        #expect(try await session.saveAs() == Data(edited.utf8))
        #expect(edited != Self.styled)
    }

    @Test func curlyQuotesSurviveTheSourceViewRoundTrip() async throws {
        let session = try await PreserveSession.make()
        try await session.open(Self.curly)
        let source = try await session.currentMarkdown()
        #expect(source == Self.curly)
        try await session.returnFromSource(source)
        session.document.hasChanges = true
        #expect(try await session.saveAs() == Data(Self.curly.utf8))
    }

    @Test func editorRebuildAfterAnUnsavedEditChangesOnlyTheEditedBlock() async throws {
        let session = try await PreserveSession.make()
        try await session.open(Self.styled)
        try await session.edit(replacing: "Second paragraph.", with: "Second paragraph, edited.")
        try await session.rebuild()
        let saved = try await session.saveAs()
        let expected = Self.styled.replacingOccurrences(of: "Second paragraph.", with: "Second paragraph, edited.")
        #expect(saved == Data(expected.utf8))
    }

    private struct Shape: CustomTestStringConvertible {
        let crlf: Bool, finalNewline: Bool, frontMatter: Bool
        var testDescription: String { "crlf=\(crlf) finalNewline=\(finalNewline) frontMatter=\(frontMatter)" }
        static let all = [false, true].flatMap { crlf in
            [false, true].flatMap { finalNewline in
                [false, true].map { Shape(crlf: crlf, finalNewline: finalNewline, frontMatter: $0) }
            }
        }
    }

    @Test(arguments: Shape.all)
    private func openAndSaveAsWithoutEditIsByteForByte(shape: Shape) async throws {
        let (crlf, finalNewline, frontMatter) = (shape.crlf, shape.finalNewline, shape.frontMatter)
        var text = (frontMatter ? "---\ntitle: \"Quoted\"\ntags: [a, b]\n---\n\n" : "") + Self.styled
        if !finalNewline { text.removeLast() }
        if crlf { text = text.replacingOccurrences(of: "\n", with: "\r\n") }
        let session = try await PreserveSession.make()
        try await session.open(text)
        #expect(try await session.saveAs() == Data(text.utf8))
    }
}

@MainActor
@Suite(.serialized) struct PreserveSourceSwitchingTests {

    private static let paragraphs = "<p>Second paragraph.</p><p>Third</p>"

    /// What saving `html` gives with nothing preserved: a fresh document, no base text.
    private static func todaysOutput(for html: String) async throws -> Data {
        let session = try await PreserveSession.make()
        await session.setContent(html)
        return try await session.saveAs()
    }

    @Test func newDocumentAfterOpenWritesNoneOfTheOpenedFilesBytes() async throws {
        let original = "# Title\r\n\r\n\r\nSecond paragraph.\r\n\r\n\r\nThird"
        let session = try await PreserveSession.make()
        try await session.open(original)
        #expect(session.document.sourceMapTag != nil)
        await session.newDocument()
        #expect(session.document.sourceMapTag == nil)
        await session.setContent(Self.paragraphs)
        let saved = try await session.saveAs()
        #expect(saved == (try await Self.todaysOutput(for: Self.paragraphs)))
        #expect(!String(decoding: saved, as: UTF8.self).contains("\r"))
    }

    @Test func markdownSavedAfterOpeningHtmlWritesTodaysOutput() async throws {
        let session = try await PreserveSession.make()
        try await session.open("# Title\r\n\r\n\r\nSecond paragraph.\r\n\r\n\r\nThird")
        try await session.openHtml(Self.paragraphs)
        #expect(session.document.sourceMapTag == nil)
        #expect(session.document.baseText == nil)
        let saved = try await session.saveAs()
        #expect(saved == (try await Self.todaysOutput(for: Self.paragraphs)))
    }

    private static let withFrontMatter = "---\ntitle: \"Quoted\"\nauthor: Zed\n---\n\nTitle\n=====\n\nFirst paragraph.\n\nA hard wrapped\nparagraph here.\n\nLast paragraph.\n"

    @Test func editedFrontMatterIsWrittenWithTheNewValues() async throws {
        let session = try await PreserveSession.make()
        try await session.open(Self.withFrontMatter)
        try await session.edit(replacing: "Quoted", with: "Changed")
        let saved = String(decoding: try await session.saveAs(), as: UTF8.self)
        let expected = Self.withFrontMatter.replacingOccurrences(of: "\"Quoted\"", with: "Changed")
        #expect(saved == expected)
    }

    @Test func uneditedFrontMatterKeepsItsQuotesAndKeyOrder() async throws {
        let text = "---\nzeta: \"1\"\nalpha: 'two'\n# kept comment\n---\n\nBody\n"
        let session = try await PreserveSession.make()
        try await session.open(text)
        #expect(try await session.saveAs() == Data(text.utf8))
    }

    @Test func secondSaveIsComparedWithTheFirst() async throws {
        let session = try await PreserveSession.make()
        try await session.open(Self.withFrontMatter)
        try await session.edit(replacing: "First paragraph.", with: "First, edited.")
        let first = Self.withFrontMatter.replacingOccurrences(of: "First paragraph.", with: "First, edited.")
        #expect(try await session.saveAs("first.md") == Data(first.utf8))
        try await session.edit(replacing: "Last paragraph.", with: "Last, edited.")
        let second = first.replacingOccurrences(of: "Last paragraph.", with: "Last, edited.")
        #expect(try await session.saveAs("second.md") == Data(second.utf8))
    }

    @Test func secondSaveKeepsTheFrontMatterTheFirstSaveWrote() async throws {
        let session = try await PreserveSession.make()
        try await session.open(Self.withFrontMatter)
        try await session.edit(replacing: "Quoted", with: "Changed")
        let first = Self.withFrontMatter.replacingOccurrences(of: "\"Quoted\"", with: "Changed")
        #expect(String(decoding: try await session.saveAs("first.md"), as: UTF8.self) == first)
        try await session.edit(replacing: "Last paragraph.", with: "Last, edited.")
        let second = first.replacingOccurrences(of: "Last paragraph.", with: "Last, edited.")
        #expect(String(decoding: try await session.saveAs("second.md"), as: UTF8.self) == second)
    }
}
