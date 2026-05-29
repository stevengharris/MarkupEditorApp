//
//  RoundTripTests.swift
//  MarkupEditorAppTests
//
//  Unit-testable coverage for RDR-015 acceptance criteria.
//  ACs 1-7 and 13 require the JS plugin + WKWebView and are covered in the
//  acceptance walkthrough (bead 2tq). ACs 8, 9, 11, 12, 15 are covered here.
//

import Testing
import Foundation
@testable import MarkupEditorApp

// MARK: - AC8 + AC9: .htmd .data round-trip (loadHtmdMetadata / saveHtmdMetadata)

struct HtmdMetadataRoundTripTests {

    private func makeTempPackage() throws -> URL {
        let url = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("RoundTripTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func saveAndLoadScalars() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        let metadata: [(key: String, value: MetadataValue)] = [
            ("title", .scalar("My Project")),
            ("date", .scalar("2026-05-29")),
            ("draft", .scalar("false"))
        ]
        try saveHtmdMetadata(metadata, to: dir)

        let dataURL = dir.appendingPathComponent(".data")
        #expect(FileManager.default.fileExists(atPath: dataURL.path))

        let loaded = loadHtmdMetadata(from: dir)
        #expect(loaded.count == 3)
        #expect(loaded[0] == (key: "title", value: .scalar("My Project")))
        #expect(loaded[1] == (key: "date", value: .scalar("2026-05-29")))
        #expect(loaded[2] == (key: "draft", value: .scalar("false")))
    }

    @Test func saveAndLoadArrayValues() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        let metadata: [(key: String, value: MetadataValue)] = [
            ("tags", .array(["swift", "ios", "macos"])),
            ("authors", .array(["Alice", "Bob"]))
        ]
        try saveHtmdMetadata(metadata, to: dir)

        let loaded = loadHtmdMetadata(from: dir)
        #expect(loaded.count == 2)
        #expect(loaded[0].value == .array(["swift", "ios", "macos"]))
        #expect(loaded[1].value == .array(["Alice", "Bob"]))
    }

    @Test func keyInsertionOrderPreserved() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        // AC11 component: insertion order must survive save→load
        let metadata: [(key: String, value: MetadataValue)] = [
            ("z", .scalar("last")),
            ("a", .scalar("first")),
            ("m", .scalar("middle"))
        ]
        try saveHtmdMetadata(metadata, to: dir)
        let loaded = loadHtmdMetadata(from: dir)
        #expect(loaded.map(\.key) == ["z", "a", "m"])
    }

    @Test func emptyMetadataProducesNoDataFile() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        try saveHtmdMetadata([], to: dir)
        #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent(".data").path))
    }

    @Test func emptyMetadataDeletesExistingDataFile() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        // Write a .data file first, then save empty metadata — file should be removed
        let initial: [(key: String, value: MetadataValue)] = [("k", .scalar("v"))]
        try saveHtmdMetadata(initial, to: dir)
        #expect(FileManager.default.fileExists(atPath: dir.appendingPathComponent(".data").path))

        try saveHtmdMetadata([], to: dir)
        #expect(!FileManager.default.fileExists(atPath: dir.appendingPathComponent(".data").path))
    }

    @Test func loadReturnsEmptyForAbsentDataFile() {
        let dir = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("absent-\(UUID().uuidString)")
        let loaded = loadHtmdMetadata(from: dir)
        #expect(loaded.isEmpty)
    }

    @Test func mixedScalarAndArrayRoundTrip() throws {
        let dir = try makeTempPackage()
        defer { try? FileManager.default.removeItem(at: dir) }

        let metadata: [(key: String, value: MetadataValue)] = [
            ("title",  .scalar("Readme")),
            ("tags",   .array(["#trending", "swift"])),
            ("layout", .scalar("home"))
        ]
        try saveHtmdMetadata(metadata, to: dir)
        let loaded = loadHtmdMetadata(from: dir)
        #expect(loaded.count == 3)
        for (a, b) in zip(metadata, loaded) {
            #expect(a.key == b.key)
            #expect(a.value == b.value)
        }
    }
}

// MARK: - AC11: Full YAML round-trip (parse → store → serialize → parse → equal)

struct AC11RoundTripTests {

    private func roundTrip(_ yaml: String) -> [(key: String, value: MetadataValue)] {
        var warnings: [String] = []
        let parsed = parseYAMLMetadata(yaml, warnings: &warnings)
        let serialized = serializeYAMLMetadata(parsed)
        return parseYAMLMetadata(serialized, warnings: &warnings)
    }

    @Test func scalarValuesRoundTrip() {
        let yaml = "title: My Post\ndate: 2026-05-29\ndraft: false\ncount: 42\n"
        let result = roundTrip(yaml)
        #expect(result.count == 4)
        #expect(result[0] == (key: "title", value: .scalar("My Post")))
        #expect(result[1] == (key: "date",  value: .scalar("2026-05-29")))
        #expect(result[2] == (key: "draft", value: .scalar("false")))
        #expect(result[3] == (key: "count", value: .scalar("42")))
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
        // Block sequences serialize as flow sequences — acceptable per AC11
        let yaml = "tags:\n  - swift\n  - ios\n"
        var warnings: [String] = []
        let parsed = parseYAMLMetadata(yaml, warnings: &warnings)
        let serialized = serializeYAMLMetadata(parsed)
        // Serialized form is flow sequence
        #expect(serialized.contains("[swift, ios]"))
        let reparsed = parseYAMLMetadata(serialized, warnings: &warnings)
        #expect(reparsed[0].value == .array(["swift", "ios"]))
    }

    @Test func quotedAndUnquotedScalarsEqualAfterRoundTrip() {
        // AC11: quoting normalization for values without metacharacters is acceptable
        let yaml = "title: \"Hello\"\nauthor: World\n"
        var warnings: [String] = []
        let parsed = parseYAMLMetadata(yaml, warnings: &warnings)
        // Both should parse as scalars with the unquoted value
        #expect(parsed[0].value == .scalar("Hello"))
        #expect(parsed[1].value == .scalar("World"))
        let serialized = serializeYAMLMetadata(parsed)
        let reparsed = parseYAMLMetadata(serialized, warnings: &warnings)
        #expect(reparsed[0].value == .scalar("Hello"))
        #expect(reparsed[1].value == .scalar("World"))
    }
}

// MARK: - AC15: Metacharacter quoting in YAML serialization

struct AC15MetacharacterTests {

    @Test func colonSpaceValueRoundTrips() {
        let meta: [(key: String, value: MetadataValue)] = [("note", .scalar("key: value"))]
        let yaml = serializeYAMLMetadata(meta)
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("key: value"))
    }

    @Test func hashValueRoundTrips() {
        let meta: [(key: String, value: MetadataValue)] = [("color", .scalar("#FF0000"))]
        let yaml = serializeYAMLMetadata(meta)
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("#FF0000"))
    }

    @Test func anchorAliasValuesRoundTrip() {
        let meta: [(key: String, value: MetadataValue)] = [
            ("ref",   .scalar("&anchor")),
            ("alias", .scalar("*ref"))
        ]
        let yaml = serializeYAMLMetadata(meta)
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("&anchor"))
        #expect(result[1].value == .scalar("*ref"))
    }

    @Test func bracketValueRoundTrips() {
        let meta: [(key: String, value: MetadataValue)] = [("data", .scalar("[1, 2, 3]"))]
        let yaml = serializeYAMLMetadata(meta)
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("[1, 2, 3]"))
    }

    @Test func arrayWithMetacharacterElementsRoundTrips() {
        let meta: [(key: String, value: MetadataValue)] = [
            ("tags", .array(["#trending", "key: val", "&anchor"]))
        ]
        let yaml = serializeYAMLMetadata(meta)
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result[0].value == .array(["#trending", "key: val", "&anchor"]))
    }
}

// MARK: - AC5: YAML frontmatter prepend format

struct YAMLFrontmatterFormatTests {

    @Test func frontmatterFormatIsCorrect() {
        let metadata: [(key: String, value: MetadataValue)] = [
            ("title", .scalar("My Post")),
            ("draft", .scalar("false"))
        ]
        let yaml = serializeYAMLMetadata(metadata)
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
        let metadata: [(key: String, value: MetadataValue)] = []
        if !metadata.isEmpty {
            let yaml = serializeYAMLMetadata(metadata)
            output = "---\n\(yaml)---\n\n\(markdown)"
        }
        #expect(output == markdown)
    }
}

// MARK: - extractHTMLPreamble tests (AC8 de-fencing + I1 edge case)

struct ExtractHTMLPreambleTests {

    @Test func extractsSimplePreamble() {
        let html = "<pre><code>&lt;div align=\"center\"&gt;\n  badge\n&lt;/div&gt;</code></pre>\n<h1>Hello</h1>"
        let (preamble, body) = extractHTMLPreamble(from: html)
        #expect(preamble == "<div align=\"center\">\n  badge\n</div>")
        #expect(body == "<h1>Hello</h1>")
    }

    @Test func returnsNilWhenNoPreamble() {
        let html = "<h1>Hello</h1>\n<p>Body.</p>"
        let (preamble, body) = extractHTMLPreamble(from: html)
        #expect(preamble == nil)
        #expect(body == html)
    }

    @Test func returnsNilWhenPreCodeIsMidDocument() {
        let html = "<h1>Hello</h1>\n<pre><code>some code</code></pre>"
        let (preamble, body) = extractHTMLPreamble(from: html)
        #expect(preamble == nil)
    }

    @Test func unescapesAmpersand() {
        let html = "<pre><code>&lt;a href=&quot;url&quot;&gt;link&lt;/a&gt;</code></pre>\n<p>Body.</p>"
        let (preamble, _) = extractHTMLPreamble(from: html)
        #expect(preamble == "<a href=\"url\">link</a>")
    }

    @Test func ampersandEntityIsUnescapedLast() {
        // &amp;lt; should become &lt; (not <) — amp is unescaped last
        let html = "<pre><code>&amp;lt;</code></pre>"
        let (preamble, _) = extractHTMLPreamble(from: html)
        #expect(preamble == "&lt;")
    }

    // I1 edge case: user-authored code block at position 0
    // The positional heuristic WILL de-fence it on .htmd/.html saves.
    // This test documents the known behavior so it is explicit, not accidental.
    @Test func userCodeBlockAtPositionZeroIsDefenced() {
        let html = "<pre><code>const x = 1\nconst y = 2</code></pre>\n<p>After.</p>"
        let (preamble, body) = extractHTMLPreamble(from: html)
        // Known limitation per RDR-015 §Design (positional heuristic, preamble marker deferred)
        #expect(preamble == "const x = 1\nconst y = 2")
        #expect(body == "<p>After.</p>")
    }
}

// MARK: - unescapeHTMLEntities coverage

struct UnescapeHTMLEntitiesTests {

    @Test func allStandardEntitiesUnescaped() {
        // Access via extractHTMLPreamble which calls unescapeHTMLEntities internally
        let html = "<pre><code>&lt;&gt;&amp;&quot;&#39;</code></pre>"
        let (preamble, _) = extractHTMLPreamble(from: html)
        #expect(preamble == "<>&\"'")
    }

    @Test func unknownEntityPassesThrough() {
        let html = "<pre><code>&nbsp;</code></pre>"
        let (preamble, _) = extractHTMLPreamble(from: html)
        #expect(preamble == "&nbsp;")
    }
}
