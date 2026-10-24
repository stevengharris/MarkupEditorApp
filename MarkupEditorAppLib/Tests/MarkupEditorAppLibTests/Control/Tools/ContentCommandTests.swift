//
//  ContentCommandTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct ContentCommandTests {

    func parse(_ tool: String, _ args: JSONValue = [:]) throws -> ContentCommand? {
        try ContentCommand(tool: tool, args: args)
    }

    func refusal(_ tool: String, _ args: JSONValue) -> String? {
        do {
            _ = try ContentCommand(tool: tool, args: args)
            return nil
        } catch {
            return error.localizedDescription
        }
    }

    // MARK: get_document

    @Test func getDocumentDefaults() throws {
        #expect(try parse("get_document") == .getDocument(format: .markdown, from: nil, limit: nil))
    }

    @Test func getDocumentReadsItsArguments() throws {
        let args: JSONValue = ["format": "html", "from": 3, "limit": 500]
        #expect(try parse("get_document", args) == .getDocument(format: .html, from: 3, limit: 500))
    }

    @Test(arguments: [
        ("format", JSONValue.string("pdf")),
        ("format", JSONValue.number(1)),
        ("from", JSONValue.number(-1)),
        ("from", JSONValue.number(1.5)),
        ("from", JSONValue.number(1e30)),
        ("from", JSONValue.number(.infinity)),
        ("from", JSONValue.string("2")),
        ("limit", JSONValue.number(0)),
        ("limit", JSONValue.number(-5)),
        ("limit", JSONValue.number(2.5)),
        ("limit", JSONValue.bool(true)),
    ])
    func getDocumentRefusesBadArguments(name: String, value: JSONValue) {
        let reason = refusal("get_document", .object([name: value]))
        #expect(reason?.contains(name) == true)
    }

    // MARK: select

    @Test func selectByBlock() throws {
        #expect(try parse("select", ["block": 2]) == .select(.block(2)))
        #expect(try parse("select", ["block": 0]) == .select(.block(0)))
    }

    @Test func selectByTextDefaultsToTheFirstOccurrence() throws {
        #expect(try parse("select", ["text": "cat"]) == .select(.text("cat", occurrence: 1)))
        #expect(try parse("select", ["text": "cat", "occurrence": 3]) == .select(.text("cat", occurrence: 3)))
    }

    @Test func selectNeedsExactlyOneTarget() {
        #expect(refusal("select", [:])?.contains("block") == true)
        #expect(refusal("select", ["block": 1, "text": "x"])?.contains("not both") == true)
        #expect(refusal("select", ["occurrence": 2])?.contains("block") == true)
        #expect(refusal("select", ["block": 1, "occurrence": 2])?.contains("occurrence") == true)
    }

    @Test(arguments: [
        ["block": JSONValue.number(-1)],
        ["block": JSONValue.number(0.5)],
        ["block": JSONValue.number(1e30)],
        ["text": JSONValue.string("a"), "occurrence": JSONValue.number(1e30)],
        ["block": JSONValue.string("1")],
        ["text": JSONValue.string("")],
        ["text": JSONValue.number(4)],
        ["text": JSONValue.string("a"), "occurrence": JSONValue.number(0)],
        ["text": JSONValue.string("a"), "occurrence": JSONValue.number(-2)],
        ["text": JSONValue.string("a"), "occurrence": JSONValue.string("2")],
    ])
    func selectRefusesBadArguments(args: [String: JSONValue]) {
        #expect(refusal("select", .object(args)) != nil)
    }

    // MARK: replace_blocks

    @Test func replaceBlocksReadsEverything() throws {
        let args: JSONValue = ["index": 2, "count": 1, "markdown": "new", "expected": ["abc"], "allowLoss": true]
        #expect(try parse("replace_blocks", args) == .replaceBlocks(index: 2, count: 1, markdown: "new", expected: ["abc"], allowLoss: true))
    }

    @Test func replaceBlocksDefaultsAllowLossToFalseAndAllowsEmptyMarkdown() throws {
        let args: JSONValue = ["index": 0, "count": 2, "markdown": "", "expected": ["a", "b"]]
        #expect(try parse("replace_blocks", args) == .replaceBlocks(index: 0, count: 2, markdown: "", expected: ["a", "b"], allowLoss: false))
    }

    @Test func replaceBlocksAllowsAnEmptyExpectedList() throws {
        let args: JSONValue = ["index": 0, "count": 0, "markdown": "x", "expected": []]
        #expect(try parse("replace_blocks", args) == .replaceBlocks(index: 0, count: 0, markdown: "x", expected: [], allowLoss: false))
    }

    @Test(arguments: ["index", "count", "markdown", "expected"])
    func replaceBlocksRequiresItsArguments(missing: String) {
        var fields: [String: JSONValue] = ["index": 0, "count": 1, "markdown": "x", "expected": ["h"]]
        fields[missing] = nil
        #expect(refusal("replace_blocks", .object(fields))?.contains(missing) == true)
    }

    @Test(arguments: [
        ("index", JSONValue.number(-1)),
        ("index", JSONValue.number(1.5)),
        ("index", JSONValue.string("1")),
        ("count", JSONValue.number(-1)),
        ("count", JSONValue.number(0.25)),
        ("count", JSONValue.null),
        ("count", JSONValue.number(1e30)),
        ("index", JSONValue.number(-1e30)),
        ("markdown", JSONValue.number(3)),
        ("markdown", JSONValue.array([])),
        ("expected", JSONValue.string("abc")),
        ("expected", JSONValue.array([.number(1)])),
        ("expected", JSONValue.array([.string("a"), .null])),
        ("allowLoss", JSONValue.string("true")),
        ("allowLoss", JSONValue.number(1)),
    ])
    func replaceBlocksRefusesBadArguments(name: String, value: JSONValue) {
        var fields: [String: JSONValue] = ["index": 0, "count": 1, "markdown": "x", "expected": ["h"]]
        fields[name] = value
        #expect(refusal("replace_blocks", .object(fields))?.contains(name) == true)
    }

    // MARK: tools without arguments, and tools that are not content tools

    @Test func argumentlessTools() throws {
        #expect(try parse("get_selection") == .getSelection)
        #expect(try parse("undo") == .undo)
        #expect(try parse("redo") == .redo)
        #expect(try parse("save_document") == .saveDocument)
    }

    @Test func otherToolsAreNotContentCommands() throws {
        #expect(try parse("app_state") == nil)
        #expect(try parse("eval_js", ["script": "1"]) == nil)
        #expect(try parse("nonsense") == nil)
    }

    // MARK: schema

    @Test func schemaEmitsIntegerBooleanAndStringArrayProperties() {
        let schema = ControlTool.schema([
            "n": .integer("a number"), "flag": .boolean("a flag"), "names": .stringArray("some names"), "s": .string("text"),
        ], required: ["n"])
        #expect(schema["properties"]?["n"] == ["type": "integer", "description": "a number"])
        #expect(schema["properties"]?["flag"] == ["type": "boolean", "description": "a flag"])
        #expect(schema["properties"]?["names"] == ["type": "array", "items": ["type": "string"], "description": "some names"])
        #expect(schema["properties"]?["s"] == ["type": "string", "description": "text"])
        #expect(schema["required"] == ["n"])
    }

    @Test func existingTupleSchemaStillWorks() {
        let schema = ControlTool.schema(["name": ("string", "The command name.")], required: ["name"])
        #expect(schema["properties"]?["name"] == ["type": "string", "description": "The command name."])
    }
}
