//
//  YAMLMetadataTests.swift
//  MarkupEditorAppTests
//

import Testing
@testable import MarkupEditorApp

struct YAMLMetadataTests {

    // MARK: - Parser tests

    @Test func parseUnquotedString() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("title: Hello World", warnings: &warnings)
        #expect(result.count == 1)
        #expect(result[0].key == "title")
        #expect(result[0].value == .scalar("Hello World"))
        #expect(warnings.isEmpty)
    }

    @Test func parseSingleQuotedString() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("title: 'Hello World'", warnings: &warnings)
        #expect(result[0].value == .scalar("Hello World"))
    }

    @Test func parseDoubleQuotedString() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("title: \"Hello World\"", warnings: &warnings)
        #expect(result[0].value == .scalar("Hello World"))
    }

    @Test func parseDoubleQuotedStringWithEscape() {
        var warnings: [String] = []
        // YAML: title: "Hello \"World\""
        let yaml = "title: \"Hello \\\"World\\\"\""
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("Hello \"World\""))
    }

    @Test func parseInteger() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("count: 42", warnings: &warnings)
        #expect(result[0].value == .scalar("42"))
    }

    @Test func parseFloat() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("score: 3.14", warnings: &warnings)
        #expect(result[0].value == .scalar("3.14"))
    }

    @Test func parseBoolTrue() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("published: true", warnings: &warnings)
        #expect(result[0].value == .scalar("true"))
    }

    @Test func parseBoolFalse() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("draft: false", warnings: &warnings)
        #expect(result[0].value == .scalar("false"))
    }

    @Test func parseNull() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("meta: null", warnings: &warnings)
        #expect(result[0].value == .scalar("null"))
    }

    @Test func parseDate() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("date: 2026-05-29", warnings: &warnings)
        #expect(result[0].value == .scalar("2026-05-29"))
    }

    @Test func parseKeyInsertionOrder() {
        let yaml = "e: 5\na: 1\nc: 3\nb: 2\nd: 4\nf: 6"
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result.map(\.key) == ["e", "a", "c", "b", "d", "f"])
    }

    @Test func parseFlowSequence() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("tags: [swift, ios, macos]", warnings: &warnings)
        #expect(result[0].value == .array(["swift", "ios", "macos"]))
    }

    @Test func parseFlowSequenceQuotedElements() {
        var warnings: [String] = []
        let result = parseYAMLMetadata(#"tags: ["swift dev", "ios"]"#, warnings: &warnings)
        #expect(result[0].value == .array(["swift dev", "ios"]))
    }

    @Test func parseBlockSequence() {
        let yaml = "tags:\n  - swift\n  - ios\n  - macos"
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result[0].key == "tags")
        #expect(result[0].value == .array(["swift", "ios", "macos"]))
    }

    @Test func parseEmptyValue() {
        var warnings: [String] = []
        let result = parseYAMLMetadata("description: ", warnings: &warnings)
        #expect(result[0].value == .scalar(""))
    }

    @Test func parseMultipleKeys() {
        let yaml = "title: My Post\ndate: 2026-05-29\ndraft: false"
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result.count == 3)
        #expect(result[0] == (key: "title", value: .scalar("My Post")))
        #expect(result[1] == (key: "date", value: .scalar("2026-05-29")))
        #expect(result[2] == (key: "draft", value: .scalar("false")))
    }

    @Test func parseSkipsBlankLinesAndComments() {
        let yaml = "\n# comment\ntitle: Hello\n\nauthor: Steve\n"
        var warnings: [String] = []
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result.count == 2)
        #expect(result[0].key == "title")
        #expect(result[1].key == "author")
    }

    // MARK: - Serializer tests

    @Test func serializeSimpleScalar() {
        let meta: [(key: String, value: MetadataValue)] = [("title", .scalar("Hello World"))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == "title: Hello World\n")
    }

    @Test func serializeScalarWithColonSpace() {
        let meta: [(key: String, value: MetadataValue)] = [("note", .scalar("key: value"))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == #"note: "key: value""# + "\n")
    }

    @Test func serializeScalarStartingWithHash() {
        let meta: [(key: String, value: MetadataValue)] = [("color", .scalar("#FF0000"))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == "color: \"#FF0000\"\n")
    }

    @Test func serializeScalarStartingWithAmpersand() {
        let meta: [(key: String, value: MetadataValue)] = [("ref", .scalar("&anchor"))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == #"ref: "&anchor""# + "\n")
    }

    @Test func serializeScalarStartingWithAsterisk() {
        let meta: [(key: String, value: MetadataValue)] = [("alias", .scalar("*ref"))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == #"alias: "*ref""# + "\n")
    }

    @Test func serializeScalarWithBracket() {
        let meta: [(key: String, value: MetadataValue)] = [("data", .scalar("[1, 2, 3]"))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == #"data: "[1, 2, 3]""# + "\n")
    }

    @Test func serializeEmptyScalar() {
        let meta: [(key: String, value: MetadataValue)] = [("empty", .scalar(""))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == "empty: \"\"\n")
    }

    @Test func serializeScalarStartingWithDash() {
        let meta: [(key: String, value: MetadataValue)] = [("item", .scalar("- list item"))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == #"item: "- list item""# + "\n")
    }

    @Test func serializeArray() {
        let meta: [(key: String, value: MetadataValue)] = [("tags", .array(["swift", "ios"]))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == "tags: [swift, ios]\n")
    }

    @Test func serializeArrayWithMetacharacterElements() {
        let meta: [(key: String, value: MetadataValue)] = [("tags", .array(["#trending", "key: val"]))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == "tags: [\"#trending\", \"key: val\"]\n")
    }

    @Test func serializeSpaceHash() {
        let meta: [(key: String, value: MetadataValue)] = [("desc", .scalar("hello #world"))]
        let result = serializeYAMLMetadata(meta)
        #expect(result == #"desc: "hello #world""# + "\n")
    }

    // MARK: - Round-trip tests

    @Test func roundTripSimple() {
        let yaml = "title: My Post\ndate: 2026-05-29\ndraft: false\n"
        var warnings: [String] = []
        let parsed = parseYAMLMetadata(yaml, warnings: &warnings)
        let serialized = serializeYAMLMetadata(parsed)
        var warnings2: [String] = []
        let reparsed = parseYAMLMetadata(serialized, warnings: &warnings2)
        #expect(parsed.count == reparsed.count)
        for (a, b) in zip(parsed, reparsed) {
            #expect(a.key == b.key)
            #expect(a.value == b.value)
        }
    }

    @Test func roundTripMetacharacters() {
        let meta: [(key: String, value: MetadataValue)] = [
            ("color", .scalar("#FF0000")),
            ("ref", .scalar("&anchor")),
            ("alias", .scalar("*ref")),
            ("note", .scalar("key: value")),
            ("url", .scalar("https://example.com/#section")),
            ("tags", .array(["#trending", "swift", "*starred"]))
        ]
        let serialized = serializeYAMLMetadata(meta)
        var warnings: [String] = []
        let reparsed = parseYAMLMetadata(serialized, warnings: &warnings)
        #expect(reparsed.count == meta.count)
        for (a, b) in zip(meta, reparsed) {
            #expect(a.key == b.key)
            #expect(a.value == b.value)
        }
    }

    @Test func roundTripArrays() {
        let meta: [(key: String, value: MetadataValue)] = [
            ("tags", .array(["swift", "ios", "macos"])),
            ("authors", .array(["Alice", "Bob"]))
        ]
        let serialized = serializeYAMLMetadata(meta)
        var warnings: [String] = []
        let reparsed = parseYAMLMetadata(serialized, warnings: &warnings)
        #expect(reparsed[0].value == .array(["swift", "ios", "macos"]))
        #expect(reparsed[1].value == .array(["Alice", "Bob"]))
    }

    @Test func parseDoubleQuotedStringWithBackslash() {
        var warnings: [String] = []
        let yaml = "path: \"C:\\\\Users\\\\docs\""
        let result = parseYAMLMetadata(yaml, warnings: &warnings)
        #expect(result[0].value == .scalar("C:\\Users\\docs"))
    }

    @Test func roundTripBackslash() {
        let meta: [(key: String, value: MetadataValue)] = [("path", .scalar("C:\\Users\\docs"))]
        let serialized = serializeYAMLMetadata(meta)
        var warnings: [String] = []
        let reparsed = parseYAMLMetadata(serialized, warnings: &warnings)
        #expect(reparsed[0].value == .scalar("C:\\Users\\docs"))
    }

    @Test func roundTripInteger() {
        let meta: [(key: String, value: MetadataValue)] = [("count", .scalar("42"))]
        let serialized = serializeYAMLMetadata(meta)
        #expect(serialized == "count: 42\n")
        var warnings: [String] = []
        let reparsed = parseYAMLMetadata(serialized, warnings: &warnings)
        #expect(reparsed[0].value == .scalar("42"))
    }
}
