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

    // MARK: propose_edits and list_suggestions

    func edit(_ fields: [String: JSONValue] = [:]) -> JSONValue {
        var base: [String: JSONValue] = ["block": 1, "expected": "abc", "find": "cat", "replace": "dog"]
        for (key, value) in fields { base[key] = value }
        return .object(base)
    }

    @Test func proposeEditsReadsEverything() throws {
        let args: JSONValue = ["edits": [
            ["block": 1, "expected": "abc", "find": "cat", "replace": "dog", "note": "prefer dogs"],
            ["block": 0, "expected": "h", "find": "mat", "replace": ""],
        ]]
        #expect(try parse("propose_edits", args) == .proposeEdits(EditBatch(edits: [
            SuggestedEdit(block: 1, expected: "abc", find: "cat", replace: "dog", note: "prefer dogs"),
            SuggestedEdit(block: 0, expected: "h", find: "mat", replace: "", note: nil),
        ])))
    }

    @Test func proposeEditsAcceptsOneAndTwoHundredEditsAndANullNote() throws {
        #expect(try parse("propose_edits", ["edits": [edit()]]) != nil)
        #expect(try parse("propose_edits", ["edits": .array(Array(repeating: edit(), count: 200))]) != nil)
        let withNull = try parse("propose_edits", ["edits": [edit(["note": .null])]])
        #expect(withNull == .proposeEdits(EditBatch(edits: [SuggestedEdit(block: 1, expected: "abc", find: "cat", replace: "dog", note: nil)])))
    }

    @Test func aSuggestedEditEncodesWithoutANullNote() throws {
        let json = try SuggestedEdit(block: 1, expected: "abc", find: "cat", replace: "dog", note: nil).jsonValue()
        #expect(json == ["block": 1, "expected": "abc", "find": "cat", "replace": "dog"])
    }

    @Test func proposeEditsNeedsAnEditsArray() {
        // The argument is named in quotes; the tool name's own "propose_edits:" prefix would satisfy a bare contains("edits").
        #expect(refusal("propose_edits", [:])?.hasPrefix("propose_edits: 'edits' ") == true)
        #expect(refusal("propose_edits", ["edits": "x"])?.hasPrefix("propose_edits: 'edits' ") == true)
        #expect(refusal("propose_edits", ["edits": [:]])?.hasPrefix("propose_edits: 'edits' ") == true)
        #expect(refusal("propose_edits", ["edits": []])?.hasPrefix("propose_edits: 'edits' must hold 1 to 200 edits") == true)
        #expect(refusal("propose_edits", ["edits": .array(Array(repeating: edit(), count: 201))])?.hasPrefix("propose_edits: 'edits' must hold 1 to 200 edits") == true)
    }

    /// The one `propose_edits` batch `args` parses to.
    func batch(_ args: JSONValue) throws -> EditBatch {
        guard case .proposeEdits(let batch)? = try parse("propose_edits", args) else { throw ControlError("not a propose_edits command") }
        return batch
    }

    @Test(arguments: [
        ("block", JSONValue.number(-1), "edits[1].block"),
        ("block", JSONValue.number(1.5), "edits[1].block"),
        ("block", JSONValue.string("1"), "edits[1].block"),
        ("block", JSONValue.null, "edits[1].block"),
        ("expected", JSONValue.string(""), "edits[1].expected"),
        ("expected", JSONValue.number(5), "edits[1].expected"),
        ("find", JSONValue.string(""), "edits[1].find"),
        ("find", JSONValue.bool(true), "edits[1].find"),
        ("replace", JSONValue.number(2), "edits[1].replace"),
        ("replace", JSONValue.null, "edits[1].replace"),
        ("replace", JSONValue.array([]), "edits[1].replace"),
        ("note", JSONValue.number(2), "edits[1].note"),
        ("note", JSONValue.array([]), "edits[1].note"),
    ])
    func aBadEditIsRefusedAloneNamingItsPathAndTheOthersStay(name: String, value: JSONValue, path: String) throws {
        let parsed = try batch(["edits": [edit(), edit([name: value]), edit(["find": "mat"])]])
        #expect(parsed.edits.map(\.find) == ["cat", "mat"])
        #expect(parsed.refusals.count == 1)
        let refused = try #require(parsed.refusals.first)
        #expect(refused.index == 1 && refused.status == "refused" && refused.id == nil)
        #expect(refused.reason?.hasPrefix("\(path) ") == true, Comment(rawValue: refused.reason ?? "no reason"))
    }

    @Test(arguments: ["block", "expected", "find", "replace"])
    func proposeEditsRefusesAnEditMissingAFieldAlone(missing: String) throws {
        var fields: [String: JSONValue] = ["block": 1, "expected": "abc", "find": "cat", "replace": "dog"]
        fields[missing] = nil
        let parsed = try batch(["edits": [.object(fields), edit()]])
        #expect(parsed.edits.count == 1)
        #expect(parsed.refusals.map(\.index) == [0])
        #expect(parsed.refusals.first?.reason?.hasPrefix("edits[0].\(missing) ") == true, Comment(rawValue: parsed.refusals.first?.reason ?? "no reason"))
    }

    @Test func anEditThatIsNotAnObjectIsRefusedAlone() throws {
        let parsed = try batch(["edits": ["cat", edit(), .null]])
        #expect(parsed.edits.count == 1)
        #expect(parsed.refusals.map(\.index) == [0, 2])
        #expect(parsed.refusals.allSatisfy { $0.reason?.hasPrefix("edits[") == true && $0.status == "refused" })
    }

    @Test func everyBadEditIsRefusedWithItsOwnZeroBasedIndex() throws {
        let parsed = try batch(["edits": [edit(), edit(["find": ""]), edit(["find": "mat"]), edit(["block": -1]), edit(["find": "rug"])]])
        #expect(parsed.edits.map(\.find) == ["cat", "mat", "rug"])
        #expect(parsed.refusals.map(\.index) == [1, 3])
        #expect(parsed.refusals[0].reason?.hasPrefix("edits[1].find ") == true)
        #expect(parsed.refusals[1].reason?.hasPrefix("edits[3].block ") == true)
    }

    @Test func aCallOfOnlyBadEditsParsesToRefusalsAndNothingToSend() throws {
        let parsed = try batch(["edits": [edit(["find": ""]), edit(["replace": .null])]])
        #expect(parsed.edits.isEmpty)
        #expect(parsed.refusals.map(\.index) == [0, 1])
    }

    @Test func mergingPutsTheEditorsResultsBackAtTheirCallPositionsInIndexOrder() throws {
        // Positions 0 and 3 are bad; the editor judged the other three as its own 0, 1 and 2.
        let parsed = try batch(["edits": [edit(["find": ""]), edit(), edit(["find": "mat"]), edit(["block": -1]), edit(["find": "rug"])]])
        let editor = ProposeResult(ok: true, results: [
            ProposeOutcome(index: 0, status: "proposed", id: "s1", block: 1),
            ProposeOutcome(index: 1, status: "refused", reason: "find not found in block 1"),
            ProposeOutcome(index: 2, status: "proposed", id: "s2", block: 1),
        ])
        let merged = parsed.merged(with: editor)
        #expect(merged.ok)
        #expect(merged.results.map(\.index) == [0, 1, 2, 3, 4])
        #expect(merged.results.map(\.status) == ["refused", "proposed", "refused", "refused", "proposed"])
        #expect(merged.results[1].id == "s1" && merged.results[4].id == "s2")
        #expect(merged.results[2].reason == "find not found in block 1")
        #expect(merged.results[0].reason?.hasPrefix("edits[0].find ") == true)
        #expect(merged.results[3].reason?.hasPrefix("edits[3].block ") == true)
    }

    @Test func mergingLeavesAWholeCallRefusalAlone() throws {
        let parsed = try batch(["edits": [edit(["find": ""]), edit()]])
        let refusal = ProposeResult(ok: false, reason: "No active view")
        #expect(parsed.merged(with: refusal) == refusal)
    }

    @Test func listSuggestionsNeedsNoArguments() throws {
        #expect(try parse("list_suggestions") == .listSuggestions)
        #expect(try parse("list_suggestions", ["anything": 1]) == .listSuggestions)
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

    @Test func schemaEmitsAnObjectArrayProperty() {
        let schema = ControlTool.schema([
            "edits": .objectArray("some edits", item: ["a": .integer("an int"), "b": .string("text")], required: ["a"]),
        ], required: ["edits"])
        #expect(schema["properties"]?["edits"] == [
            "type": "array",
            "items": ["type": "object", "properties": ["a": ["type": "integer", "description": "an int"], "b": ["type": "string", "description": "text"]], "required": ["a"]],
            "description": "some edits",
        ])
    }

    @Test func existingTupleSchemaStillWorks() {
        let schema = ControlTool.schema(["name": ("string", "The command name.")], required: ["name"])
        #expect(schema["properties"]?["name"] == ["type": "string", "description": "The command name."])
    }
}
