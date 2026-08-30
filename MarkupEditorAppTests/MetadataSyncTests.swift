//
//  MetadataSyncTests.swift
//  MarkupEditorAppTests
//
//  Covers the metadata seeding helper, the sync boundary (and its
//  sync-safety rule), and the saveHtml guard against leaking metadata into .html.
//

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor
private func makeMetadata(_ key: String = "title", _ value: String = "Test") -> MetadataTuple {
    MetadataTuple(key: key, value: .scalar(value))
}

// MARK: - extractMetadataBlock

@MainActor struct ExtractMetadataBlockTests {

    @Test func findsAMetadataBlockAtPosition0() {
        let doc = MarkupDocument()
        let html = "<pre><code class=\"language-metadata\">title: Hi</code></pre><h1>Hello</h1>"
        let (metadata, body) = doc.extractMetadataBlock(from: html)
        #expect(metadata == "title: Hi")
        #expect(body == "<h1>Hello</h1>")
    }

    @Test func returnsNilWhenNoBlockIsPresent() {
        let doc = MarkupDocument()
        let html = "<h1>Hello</h1>"
        let (metadata, body) = doc.extractMetadataBlock(from: html)
        #expect(metadata == nil)
        #expect(body == html)
    }

    @Test func doesNotMatchAnOrdinaryCodeBlockAtPosition0() {
        // A genuine, unrelated leading code block -- no language-metadata class -- must not
        // be mistaken for a metadata block.
        let doc = MarkupDocument()
        let html = "<pre><code class=\"language-swift\">let x = 1</code></pre><p>body</p>"
        let (metadata, body) = doc.extractMetadataBlock(from: html)
        #expect(metadata == nil)
        #expect(body == html)
    }

    @Test func doesNotMatchAMetadataBlockNotAtPosition0() {
        let doc = MarkupDocument()
        let html = "<h1>Hello</h1><pre><code class=\"language-metadata\">title: Hi</code></pre>"
        let (metadata, body) = doc.extractMetadataBlock(from: html)
        #expect(metadata == nil)
        #expect(body == html)
    }

    @Test func unescapesHTMLEntitiesInTheExtractedContent() {
        let doc = MarkupDocument()
        let html = "<pre><code class=\"language-metadata\">title: A &amp; B &lt;tag&gt;</code></pre>"
        let (metadata, _) = doc.extractMetadataBlock(from: html)
        #expect(metadata == "title: A & B <tag>")
    }

    @Test func findsAnEmptyBlock() {
        let doc = MarkupDocument()
        let html = "<pre><code class=\"language-metadata\"></code></pre><p>body</p>"
        let (metadata, _) = doc.extractMetadataBlock(from: html)
        #expect(metadata == "")
    }
}

// MARK: - syncMetadata(fromHTML:warnings:) -- the sync-safety rule

@MainActor struct SyncMetadataTests {

    @Test func overwritesMetadataWhenABlockIsFound() {
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata("stale", "value")]
        var warnings: [String] = []
        doc.syncMetadata(fromHTML: "<pre><code class=\"language-metadata\">title: New</code></pre>", warnings: &warnings)
        #expect(doc.metadata == [MetadataTuple(key: "title", value: .scalar("New"))])
    }

    @Test func neverClearsMetadataWhenNoBlockIsFound() {
        // "not found" (left untouched) vs "found but empty" (cleared to []) are different
        // outcomes -- this is the "not found" case.
        let doc = MarkupDocument()
        let existing = [makeMetadata("title", "Keep Me")]
        doc.metadata = existing
        var warnings: [String] = []
        doc.syncMetadata(fromHTML: "<h1>No metadata block here</h1>", warnings: &warnings)
        #expect(doc.metadata == existing)
    }

    @Test func clearsToEmptyWhenTheBlockIsFoundButEmpty() {
        // "found but empty" is a different outcome from "not found" -- it DOES overwrite, to [].
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata("title", "Was Here")]
        var warnings: [String] = []
        doc.syncMetadata(fromHTML: "<pre><code class=\"language-metadata\"></code></pre>", warnings: &warnings)
        #expect(doc.metadata.isEmpty)
    }

    @Test func collectsWarningsForUnparseableLines() {
        let doc = MarkupDocument()
        var warnings: [String] = []
        doc.syncMetadata(fromHTML: "<pre><code class=\"language-metadata\">not a valid line at all with no colon</code></pre>", warnings: &warnings)
        #expect(!warnings.isEmpty)
    }
}

// MARK: - seedMetadataBlock(in:) -- conditional seeding

@MainActor struct SeedMetadataBlockTests {

    @Test func isANoOpWhenMetadataIsEmpty() {
        // A document with no metadata gets nothing inserted, so a genuinely leading block
        // already present stays undisturbed.
        let doc = MarkupDocument()
        #expect(doc.metadata.isEmpty)
        let html = "<pre><code class=\"language-swift\">let x = 1</code></pre>"
        #expect(doc.seedMetadataBlock(in: html) == html)
    }

    @Test func insertsAMetadataBlockAtPosition0WhenMetadataIsNonEmpty() {
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata("title", "My Post")]
        let html = "<h1>Hello</h1>"
        let seeded = doc.seedMetadataBlock(in: html)
        // No trailing newline before </code> -- would read as a stray blank line in the
        // Source tab otherwise, even though YAMLMetadata.serialize's own output does end in one
        // (load-bearing for injectYAMLFrontMatter's closing "---").
        #expect(seeded == "<pre><code class=\"language-metadata\">title: My Post</code></pre><h1>Hello</h1>")
    }

    @Test func hasNoTrailingBlankLineWithMultipleKeys() {
        // YAMLMetadata.serialize's own trailing "\n" must not leak through as an empty line
        // after the last key when viewing Source.
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata("title", "My Post"), makeMetadata("author", "Steve"), makeMetadata("date", "2026-08-29")]
        let seeded = doc.seedMetadataBlock(in: "<p></p>")
        let (content, _) = doc.extractMetadataBlock(from: seeded)
        #expect(content == "title: My Post\nauthor: Steve\ndate: 2026-08-29")
        #expect(content?.hasSuffix("\n") == false)
    }

    @Test func escapesHTMLSpecialCharactersInTheSeededContent() {
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata("title", "A & B <tag>")]
        let seeded = doc.seedMetadataBlock(in: "<p></p>")
        #expect(seeded.contains("A &amp; B &lt;tag&gt;"))
        #expect(!seeded.contains("A & B <tag>"))
    }

    @Test func seedThenExtractRoundTripsTheSameMetadata() {
        // The seeding and sync halves compose correctly: what gets seeded is exactly
        // what a subsequent sync would read back out.
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata("title", "My Post"), makeMetadata("author", "Steve")]
        let seeded = doc.seedMetadataBlock(in: "<p>body</p>")

        let other = MarkupDocument()
        var warnings: [String] = []
        other.syncMetadata(fromHTML: seeded, warnings: &warnings)
        #expect(other.metadata == doc.metadata)
    }
}

// MARK: - saveHtml guard

@MainActor struct SaveHtmlMetadataGuardTests {

    private func makeTempDir() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func stripsAMetadataBlockAtPosition0BeforeWriting() throws {
        let doc = MarkupDocument()
        let dir = try makeTempDir()
        let fileURL = dir.appendingPathComponent("test.html")
        let html = "<pre><code class=\"language-metadata\">title: Secret</code></pre><h1>Hello</h1>"

        try doc.saveHtml(html: html, to: fileURL, srcs: [], baseUrl: dir)

        let written = try String(contentsOf: fileURL, encoding: .utf8)
        #expect(!written.contains("language-metadata"))
        #expect(!written.contains("Secret"))
        #expect(written == "<h1>Hello</h1>")
    }

    @Test func writesUnchangedWhenNoMetadataBlockIsPresent() throws {
        let doc = MarkupDocument()
        let dir = try makeTempDir()
        let fileURL = dir.appendingPathComponent("test.html")
        let html = "<h1>Hello</h1><p>No frontmatter here.</p>"

        try doc.saveHtml(html: html, to: fileURL, srcs: [], baseUrl: dir)

        let written = try String(contentsOf: fileURL, encoding: .utf8)
        #expect(written == html)
    }

    @Test func doesNotStripAnOrdinaryLeadingCodeBlock() throws {
        let doc = MarkupDocument()
        let dir = try makeTempDir()
        let fileURL = dir.appendingPathComponent("test.html")
        let html = "<pre><code class=\"language-swift\">let x = 1</code></pre><p>body</p>"

        try doc.saveHtml(html: html, to: fileURL, srcs: [], baseUrl: dir)

        let written = try String(contentsOf: fileURL, encoding: .utf8)
        #expect(written == html)
    }
}

// MARK: - saveMd -- markdown is expected already-complete, not re-injected

@MainActor struct SaveMdTests {

    private func makeTempDir() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func writesMarkdownVerbatimEvenWithNonEmptyMetadata() throws {
        // Every call site that produces markdown injects frontmatter itself before saveMd
        // sees it; saveMd must not re-inject on top and duplicate it.
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata("title", "Should Not Appear Twice")]
        let dir = try makeTempDir()
        let fileURL = dir.appendingPathComponent("test.md")
        let markdown = "---\ntitle: Should Not Appear Twice\n---\n\n# Hello\n"

        try doc.saveMd(markdown: markdown, to: fileURL, srcs: [], baseUrl: dir)

        let written = try String(contentsOf: fileURL, encoding: .utf8)
        #expect(written == markdown)
        #expect(written.components(separatedBy: "title:").count == 2) // exactly one occurrence
    }

    @Test func writesPlainMarkdownWithNoFrontmatterUnchanged() throws {
        let doc = MarkupDocument()
        let dir = try makeTempDir()
        let fileURL = dir.appendingPathComponent("test.md")
        let markdown = "# Hello\n\nNo frontmatter at all.\n"

        try doc.saveMd(markdown: markdown, to: fileURL, srcs: [], baseUrl: dir)

        let written = try String(contentsOf: fileURL, encoding: .utf8)
        #expect(written == markdown)
    }
}
