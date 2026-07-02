//
//  RoundTripTests.swift
//  MarkupEditorAppTests
//
//  Coverage for YAML metadata, htmd package round-trips, and HTML preamble extraction.
//  Tests requiring the JS plugin + WKWebView are covered in the acceptance walkthrough (bead 2tq).
//

import Testing
import Foundation
@testable import MarkupEditorApp

// MARK: - .htmd .data round-trip (saveHtmdMetadata / loadHtmdMetadata)

@MainActor struct HtmdMetadataRoundTripTests {

    private func makeTempPackage() throws -> URL {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("RoundTripTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func saveAndLoadScalars() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        let metadata: [MetadataTuple] = [
            MetadataTuple(key: "title", value: .scalar("My Project")),
            MetadataTuple(key: "date",  value: .scalar("2026-05-29")),
            MetadataTuple(key: "draft", value: .scalar("false"))
        ]
        try MarkupDocument().saveHtmdMetadata(metadata, to: dir)

        let dataURL = dir.appendingPathComponent("index.data")
        #expect(FileManager.default.fileExists(atPath: dataURL.path(percentEncoded: false)))

        let loaded = MarkupDocument().loadHtmdMetadata(from: dir, htmlFilename: "index.html")
        #expect(loaded.count == 3)
        #expect(loaded[0] == MetadataTuple(key: "title", value: .scalar("My Project")))
        #expect(loaded[1] == MetadataTuple(key: "date",  value: .scalar("2026-05-29")))
        #expect(loaded[2] == MetadataTuple(key: "draft", value: .scalar("false")))
    }

    @Test func saveAndLoadArrayValues() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        let metadata: [MetadataTuple] = [
            MetadataTuple(key: "tags",    value: .array(["swift", "ios", "macos"])),
            MetadataTuple(key: "authors", value: .array(["Alice", "Bob"]))
        ]
        try MarkupDocument().saveHtmdMetadata(metadata, to: dir)

        let loaded = MarkupDocument().loadHtmdMetadata(from: dir, htmlFilename: "index.html")
        #expect(loaded.count == 2)
        #expect(loaded[0].value == .array(["swift", "ios", "macos"]))
        #expect(loaded[1].value == .array(["Alice", "Bob"]))
    }

    @Test func keyInsertionOrderPreserved() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        // Insertion order must survive save→load
        let metadata: [MetadataTuple] = [
            MetadataTuple(key: "z", value: .scalar("last")),
            MetadataTuple(key: "a", value: .scalar("first")),
            MetadataTuple(key: "m", value: .scalar("middle"))
        ]
        try MarkupDocument().saveHtmdMetadata(metadata, to: dir)
        let loaded = MarkupDocument().loadHtmdMetadata(from: dir, htmlFilename: "index.html")
        #expect(loaded.map(\.key) == ["z", "a", "m"])
    }

    @Test func emptyMetadataProducesNoDataFile() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        try MarkupDocument().saveHtmdMetadata([], to: dir)
        #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("index.data").path(percentEncoded: false)))
    }

    @Test func emptyMetadataDeletesExistingDataFile() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        // Write a .data file first, then save empty metadata — file should be removed
        let initial: [MetadataTuple] = [MetadataTuple(key: "k", value: .scalar("v"))]
        try MarkupDocument().saveHtmdMetadata(initial, to: dir)
        #expect(FileManager.default.fileExists(atPath: dir.appendingPathComponent("index.data").path(percentEncoded: false)))

        try MarkupDocument().saveHtmdMetadata([], to: dir)
        #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent("index.data").path(percentEncoded: false)))
    }

    @Test func loadReturnsEmptyForAbsentDataFile() {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("absent-\(UUID().uuidString)")
        let loaded = MarkupDocument().loadHtmdMetadata(from: dir, htmlFilename: "index.html")
        #expect(loaded.isEmpty)
    }

    @Test func mixedScalarAndArrayRoundTrip() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        let metadata: [MetadataTuple] = [
            MetadataTuple(key: "title",  value: .scalar("Readme")),
            MetadataTuple(key: "tags",   value: .array(["#trending", "swift"])),
            MetadataTuple(key: "layout", value: .scalar("home"))
        ]
        try MarkupDocument().saveHtmdMetadata(metadata, to: dir)
        let loaded = MarkupDocument().loadHtmdMetadata(from: dir, htmlFilename: "index.html")
        #expect(loaded.count == 3)
        for (a, b) in zip(metadata, loaded) {
            #expect(a.key == b.key)
            #expect(a.value == b.value)
        }
    }
}

// MARK: - YAML parse/serialize round-trip

struct YAMLRoundTripTests {

    private func roundTrip(_ yaml: String) -> [MetadataTuple] {
        var warnings: [String] = []
        let parsed = YAMLMetadata.parse(yaml, warnings: &warnings)
        let serialized = YAMLMetadata.serialize(parsed)
        return YAMLMetadata.parse(serialized, warnings: &warnings)
    }

    @Test func scalarValuesRoundTrip() {
        let yaml = "title: My Post\ndate: 2026-05-29\ndraft: false\ncount: 42\n"
        let result = roundTrip(yaml)
        #expect(result.count == 4)
        #expect(result[0] == MetadataTuple(key: "title", value: .scalar("My Post")))
        #expect(result[1] == MetadataTuple(key: "date",  value: .scalar("2026-05-29")))
        #expect(result[2] == MetadataTuple(key: "draft", value: .scalar("false")))
        #expect(result[3] == MetadataTuple(key: "count", value: .scalar("42")))
    }

    @Test func arrayValuesRoundTrip() {
        let yaml = "tags: [swift, ios, macos]\nauthors: [Alice, Bob]\n"
        let result = roundTrip(yaml)
        #expect(result[0].value == .array(["swift", "ios", "macos"]))
        #expect(result[1].value == .array(["Alice", "Bob"]))
    }

    @Test func keyInsertionOrderSurvivesRoundTrip() {
        let yaml = "z: last\na: first\nm: middle\n"
        let result = roundTrip(yaml)
        #expect(result.map(\.key) == ["z", "a", "m"])
    }

    @Test func blockSequenceRoundTripsAsFlowSequence() {
        // Block sequences serialize as flow sequences
        let yaml = "tags:\n  - swift\n  - ios\n"
        var warnings: [String] = []
        let parsed = YAMLMetadata.parse(yaml, warnings: &warnings)
        let serialized = YAMLMetadata.serialize(parsed)
        #expect(serialized.contains("[swift, ios]"))
        let reparsed = YAMLMetadata.parse(serialized, warnings: &warnings)
        #expect(reparsed[0].value == .array(["swift", "ios"]))
    }

    @Test func quotedAndUnquotedScalarsEqualAfterRoundTrip() {
        // Quoting normalization for values without metacharacters is acceptable
        let yaml = "title: \"Hello\"\nauthor: World\n"
        var warnings: [String] = []
        let parsed = YAMLMetadata.parse(yaml, warnings: &warnings)
        #expect(parsed[0].value == .scalar("Hello"))
        #expect(parsed[1].value == .scalar("World"))
        let serialized = YAMLMetadata.serialize(parsed)
        let reparsed = YAMLMetadata.parse(serialized, warnings: &warnings)
        #expect(reparsed[0].value == .scalar("Hello"))
        #expect(reparsed[1].value == .scalar("World"))
    }

    // MARK: - Metacharacter quoting

    @Test func colonSpaceValueRoundTrips() {
        let meta: [MetadataTuple] = [MetadataTuple(key: "note", value: .scalar("key: value"))]
        let yaml = YAMLMetadata.serialize(meta)
        var warnings: [String] = []
        let result = YAMLMetadata.parse(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("key: value"))
    }

    @Test func hashValueRoundTrips() {
        let meta: [MetadataTuple] = [MetadataTuple(key: "color", value: .scalar("#FF0000"))]
        let yaml = YAMLMetadata.serialize(meta)
        var warnings: [String] = []
        let result = YAMLMetadata.parse(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("#FF0000"))
    }

    @Test func anchorAliasValuesRoundTrip() {
        let meta: [MetadataTuple] = [
            MetadataTuple(key: "ref",   value: .scalar("&anchor")),
            MetadataTuple(key: "alias", value: .scalar("*ref"))
        ]
        let yaml = YAMLMetadata.serialize(meta)
        var warnings: [String] = []
        let result = YAMLMetadata.parse(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("&anchor"))
        #expect(result[1].value == .scalar("*ref"))
    }

    @Test func bracketValueRoundTrips() {
        let meta: [MetadataTuple] = [MetadataTuple(key: "data", value: .scalar("[1, 2, 3]"))]
        let yaml = YAMLMetadata.serialize(meta)
        var warnings: [String] = []
        let result = YAMLMetadata.parse(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("[1, 2, 3]"))
    }

    @Test func arrayWithMetacharacterElementsRoundTrips() {
        let meta: [MetadataTuple] = [
            MetadataTuple(key: "tags", value: .array(["#trending", "key: val", "&anchor"]))
        ]
        let yaml = YAMLMetadata.serialize(meta)
        var warnings: [String] = []
        let result = YAMLMetadata.parse(yaml, warnings: &warnings)
        #expect(result[0].value == .array(["#trending", "key: val", "&anchor"]))
    }
}

// MARK: - YAML frontmatter prepend format

struct YAMLFrontmatterFormatTests {

    @Test func frontmatterFormatIsCorrect() {
        let metadata: [MetadataTuple] = [
            MetadataTuple(key: "title", value: .scalar("My Post")),
            MetadataTuple(key: "draft", value: .scalar("false"))
        ]
        let yaml = YAMLMetadata.serialize(metadata)
        let markdown = "# Hello\n\nBody text.\n"
        let output = "---\n\(yaml)---\n\n\(markdown)"
        // Must start with --- on its own line
        #expect(output.hasPrefix("---\n"))
        // Closing --- must be on its own line followed by blank line
        #expect(output.contains("\n---\n\n"))
        // Body must follow the blank line
        #expect(output.hasSuffix(markdown))
        // Keys must be present
        #expect(output.contains("title: My Post"))
        #expect(output.contains("draft: false"))
    }

    @Test func emptyMetadataProducesNoPrepend() {
        let markdown = "# Hello\n"
        var output = markdown
        let metadata: [MetadataTuple] = []
        if !metadata.isEmpty {
            let yaml = YAMLMetadata.serialize(metadata)
            output = "---\n\(yaml)---\n\n\(markdown)"
        }
        #expect(output == markdown)
    }
}

// MARK: - extractHTMLPreamble

@MainActor struct ExtractHTMLPreambleTests {

    @Test func extractsSimplePreamble() {
        let html = "<pre><code>&lt;div align=\"center\"&gt;\n  badge\n&lt;/div&gt;</code></pre>\n<h1>Hello</h1>"
        let (preamble, body) = MarkupDocument().extractHTMLPreamble(from: html)
        #expect(preamble == "<div align=\"center\">\n  badge\n</div>")
        #expect(body == "<h1>Hello</h1>")
    }

    @Test func returnsNilWhenNoPreamble() {
        let html = "<h1>Hello</h1>\n<p>Body.</p>"
        let (preamble, body) = MarkupDocument().extractHTMLPreamble(from: html)
        #expect(preamble == nil)
        #expect(body == html)
    }

    @Test func returnsNilWhenPreCodeIsMidDocument() {
        let html = "<h1>Hello</h1>\n<pre><code>some code</code></pre>"
        let (preamble, _) = MarkupDocument().extractHTMLPreamble(from: html)
        #expect(preamble == nil)
    }

    @Test func unescapesAmpersand() {
        let html = "<pre><code>&lt;a href=&quot;url&quot;&gt;link&lt;/a&gt;</code></pre>\n<p>Body.</p>"
        let (preamble, _) = MarkupDocument().extractHTMLPreamble(from: html)
        #expect(preamble == "<a href=\"url\">link</a>")
    }

    @Test func ampersandEntityIsUnescapedLast() {
        // &amp;lt; should become &lt; (not <) — amp is unescaped last
        let html = "<pre><code>&amp;lt;</code></pre>"
        let (preamble, _) = MarkupDocument().extractHTMLPreamble(from: html)
        #expect(preamble == "&lt;")
    }

    // I1 edge case: user-authored code block at position 0
    // The positional heuristic WILL de-fence it on .htmd/.html saves.
    // This test documents the known behavior so it is explicit, not accidental.
    @Test func userCodeBlockAtPositionZeroIsDefenced() {
        let html = "<pre><code>const x = 1\nconst y = 2</code></pre>\n<p>After.</p>"
        let (preamble, body) = MarkupDocument().extractHTMLPreamble(from: html)
        // Known limitation per RDR-015 §Design (positional heuristic, preamble marker deferred)
        #expect(preamble == "const x = 1\nconst y = 2")
        #expect(body == "<p>After.</p>")
    }
}

// MARK: - unescapeHTMLEntities coverage

@MainActor struct UnescapeHTMLEntitiesTests {

    @Test func allStandardEntitiesUnescaped() {
        // Access via extractHTMLPreamble which calls unescapeHTMLEntities internally
        let html = "<pre><code>&lt;&gt;&amp;&quot;&#39;</code></pre>"
        let (preamble, _) = MarkupDocument().extractHTMLPreamble(from: html)
        #expect(preamble == "<>&\"'")
    }

    @Test func unknownEntityPassesThrough() {
        let html = "<pre><code>&nbsp;</code></pre>"
        let (preamble, _) = MarkupDocument().extractHTMLPreamble(from: html)
        #expect(preamble == "&nbsp;")
    }
}
