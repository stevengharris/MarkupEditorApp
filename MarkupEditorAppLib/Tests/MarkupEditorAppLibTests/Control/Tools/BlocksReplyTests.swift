//
//  BlocksReplyTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import JavaScriptCore
import MarkupEditor
import Testing
@testable import MarkupEditorAppLib

struct BlocksReplyTests {

    // Captured from the editor.
    let page = ##"{"ok":true,"blocks":[{"index":0,"kind":"heading","hash":"12013f90100b4d","markdown":"# Title","warnings":[]},{"index":1,"kind":"paragraph","hash":"1d498394030889","markdown":"first paragraph","warnings":["Underline was written as plain text"]}],"count":3,"firstEditable":0,"next":2}"##
    let replaced = #"{"ok":true,"range":{"index":2,"count":1},"blocks":[{"index":2,"kind":"paragraph","hash":"1c1fc7ab377bb4","markdown":"second changed","warnings":[]}],"warnings":["Image converted to a link because its source is not a relative path: https://example.invalid/x.png"]}"#
    let stale = #"{"ok":false,"reason":"The document changed since it was read: the blocks here no longer match the expected hashes. Nothing was changed.","blocks":[{"index":1,"kind":"paragraph","hash":"aa","markdown":"now","warnings":[]}]}"#

    @Test func aBlocksPageDecodes() throws {
        let reply = try BlocksReply.decode(page)
        #expect(reply.ok)
        #expect(reply.count == 3)
        #expect(reply.firstEditable == 0)
        #expect(reply.next == 2)
        #expect(reply.blocks.map(\.kind) == ["heading", "paragraph"])
        #expect(reply.blocks[1].warnings == ["Underline was written as plain text"])
    }

    @Test func aRefusalDecodesWithItsReason() throws {
        let reply = try BlocksReply.decode(#"{"ok":false,"reason":"No active view"}"#)
        #expect(!reply.ok)
        #expect(reply.reason == "No active view")
        #expect(reply.blocks.isEmpty)
    }

    @Test func aReplaceResultDecodes() throws {
        let result = try ReplaceResult.decode(replaced)
        #expect(result.ok)
        #expect(result.range == .init(index: 2, count: 1))
        #expect(result.blocks.first?.markdown == "second changed")
        #expect(result.warnings.count == 1)
    }

    @Test func aStaleRefusalKeepsTheCurrentBlocks() throws {
        let result = try ReplaceResult.decode(stale)
        #expect(!result.ok)
        #expect(result.reason?.hasPrefix("The document changed") == true)
        #expect(result.range == nil)
        #expect(result.blocks.map(\.hash) == ["aa"])
        #expect(result.warnings.isEmpty)
    }

    @Test func noResultIsReported() {
        #expect(throws: ContentBridgeError.noResult("getBlocks")) { try BlocksReply.decode(nil) }
        #expect(throws: ContentBridgeError.noResult("replaceBlocks")) { try ReplaceResult.decode(NSNull()) }
    }

    @Test func unreadableTextIsReportedWithItsText() {
        #expect(throws: ContentBridgeError.undecodable(function: "getBlocks", raw: "oops")) { try BlocksReply.decode("oops") }
        #expect(throws: ContentBridgeError.undecodable(function: "replaceBlocks", raw: "{}")) { try ReplaceResult.decode("{}") }
    }
}

struct SelectionResultDecodeTests {
    @Test func foundAndNotFoundDecode() throws {
        #expect(try SelectionResult.decode(#"{"found":true,"blockIndex":3}"#) == SelectionResult(found: true, blockIndex: 3))
        #expect(try SelectionResult.decode(#"{"found":false}"#) == SelectionResult(found: false))
        #expect(try SelectionResult.decode(#"{"found":false,"reason":"No active view"}"#) == SelectionResult(found: false, reason: "No active view"))
    }
}

// MARK: Suggestions

/// Hand-written replies in the shape `MU.proposeEdits` and `MU.listSuggestions` return (see markupeditor-app/src/suggestions.js),
/// with refusal reasons worded as that file words them today. Key order is the editor's, not the decoder's. They pin what the
/// decoders read, not the editor's wording: the headless tests run the real editor.
struct SuggestionReplyDecodeTests {

    let allProposed = #"{"ok":true,"results":[{"index":0,"status":"proposed","block":1,"id":"s1"},{"index":1,"status":"proposed","block":1,"id":"s2"}]}"#
    let mixed = #"{"ok":true,"results":[{"index":0,"status":"proposed","block":1,"id":"s1"},{"index":1,"status":"proposed","block":1,"id":"s2"},{"index":2,"status":"refused","reason":"find not found in block 2; matching is exact and case-sensitive against the visible text of one paragraph, list item or table cell, without Markdown syntax (leave out ** _ ` ~~ [ ]( ) ![]( ) # list markers and backslash escapes; inline code matches without its backticks)"},{"index":3,"status":"refused","reason":"document changed: block 1 no longer matches the expected hash; read it again"}]}"#
    let pending = #"{"ok":true,"suggestions":[{"id":"s1","status":"pending","block":1,"find":"cat","replace":"dog","note":"prefer dogs"},{"id":"s2","status":"pending","block":1,"find":"mat","replace":""}]}"#
    let resolved = #"{"ok":true,"suggestions":[{"id":"s1","status":"pending","block":1,"find":"cat","replace":"dog","note":"prefer dogs"},{"id":"s2","status":"accepted","block":1,"find":"mat","replace":""},{"id":"s3","status":"stale","block":2,"find":"dog","replace":"fox","reason":"edited"},{"id":"s4","status":"stale","block":0,"find":"ran","replace":"walked","note":"tense","reason":"document-replaced"},{"id":"s5","status":"rejected","block":1,"find":"sat","replace":"stood"}]}"#

    @Test func allProposedDecodes() throws {
        let result = try ProposeResult.decode(allProposed)
        #expect(result.ok)
        #expect(result.reason == nil)
        #expect(result.results == [
            ProposeOutcome(index: 0, status: "proposed", id: "s1", block: 1),
            ProposeOutcome(index: 1, status: "proposed", id: "s2", block: 1),
        ])
    }

    @Test func aMixedReplyKeepsEachRefusalWithItsReason() throws {
        let result = try ProposeResult.decode(mixed)
        try #require(result.results.count == 4, "one result per edit")
        #expect(result.results.map(\.status) == ["proposed", "proposed", "refused", "refused"])
        #expect(result.results[2].id == nil)
        #expect(result.results[2].block == nil)
        #expect(result.results[2].reason?.hasPrefix("find not found in block 2; matching is exact and case-sensitive against the visible text") == true)
        #expect(result.results[3].reason?.hasPrefix("document changed") == true)
    }

    @Test func aWholeCallRefusalDecodesWithNoResults() throws {
        let result = try ProposeResult.decode(#"{"ok":false,"reason":"edits must be an array of 1 to 200 edits"}"#)
        #expect(!result.ok)
        #expect(result.reason == "edits must be an array of 1 to 200 edits")
        #expect(result.results.isEmpty)
        #expect(try ProposeResult.decode(#"{"ok":false,"reason":"No active view"}"#).reason == "No active view")
    }

    @Test func anEmptyListDecodes() throws {
        let list = try SuggestionList.decode(#"{"ok":true,"suggestions":[]}"#)
        #expect(list.ok)
        #expect(list.suggestions.isEmpty)
    }

    @Test func pendingSuggestionsDecodeWithAndWithoutANote() throws {
        let list = try SuggestionList.decode(pending)
        #expect(list.suggestions == [
            Suggestion(id: "s1", status: "pending", block: 1, find: "cat", replace: "dog", note: "prefer dogs"),
            Suggestion(id: "s2", status: "pending", block: 1, find: "mat", replace: ""),
        ])
    }

    @Test func everyStatusDecodesAndAStaleOneKeepsItsReason() throws {
        let list = try SuggestionList.decode(resolved)
        try #require(list.suggestions.count == 5, "one entry per suggestion")
        #expect(list.suggestions.map(\.status) == ["pending", "accepted", "stale", "stale", "rejected"])
        #expect(list.suggestions.map(\.reason) == [nil, nil, "edited", "document-replaced", nil])
        #expect(list.suggestions[3].note == "tense")
        #expect(list.suggestions[3].block == 0)
    }

    @Test func aRefusedListDecodesWithItsReason() throws {
        let list = try SuggestionList.decode(#"{"ok":false,"reason":"No active view"}"#)
        #expect(!list.ok)
        #expect(list.reason == "No active view")
        #expect(list.suggestions.isEmpty)
    }

    @Test func noResultIsReported() {
        #expect(throws: ContentBridgeError.noResult("proposeEdits")) { try ProposeResult.decode(nil) }
        #expect(throws: ContentBridgeError.noResult("listSuggestions")) { try SuggestionList.decode(NSNull()) }
        #expect(throws: ContentBridgeError.noResult("proposeEdits")) { try ProposeResult.decode(42) }
        #expect(throws: ContentBridgeError.noResult("listSuggestions")) { try SuggestionList.decode(["ok": true]) }
    }

    @Test func unreadableTextIsReportedWithItsText() {
        #expect(throws: ContentBridgeError.undecodable(function: "proposeEdits", raw: "oops")) { try ProposeResult.decode("oops") }
        #expect(throws: ContentBridgeError.undecodable(function: "listSuggestions", raw: "{}")) { try SuggestionList.decode("{}") }
        #expect(throws: ContentBridgeError.undecodable(function: "listSuggestions", raw: #"{"ok":true,"suggestions":[{"id":"s1"}]}"#)) {
            try SuggestionList.decode(#"{"ok":true,"suggestions":[{"id":"s1"}]}"#)
        }
    }
}

// MARK: The edits the bridge sends

/// The bridge passes the model's edits to `MU.proposeEdits` as a JavaScript literal. The text is hostile
/// input, so it is checked through a real JavaScript engine, not only through a JSON decoder.
struct SuggestedEditLiteralTests {

    static let nasty = [
        SuggestedEdit(block: 1, expected: "ab\"c", find: "say \"hi\" and 'bye'", replace: "back\\slash \\n \\\" end", note: "line one\nline two\r\ttabbed"),
        SuggestedEdit(block: 2, expected: "h", find: "</script><script>alert(1)</script>", replace: "a\u{2028}b\u{2029}c", note: nil),
        SuggestedEdit(block: 3, expected: "h", find: "emoji \u{1F600} and \u{0}nul", replace: "`${1+1}` $&", note: ""),
    ]

    @Test func theLiteralIsOneLineOfValidJSON() throws {
        let literal = MarkupWKWebView.jsLiteral(Self.nasty)
        #expect(!literal.contains("\n"))
        #expect(!literal.contains("\r"))
        #expect(try JSONDecoder().decode([SuggestedEdit].self, from: Data(literal.utf8)) == Self.nasty)
    }

    @Test func aJavaScriptEngineReadsTheLiteralBackToTheSameEdits() throws {
        let literal = MarkupWKWebView.jsLiteral(Self.nasty)
        let context = try #require(JSContext())
        var thrown: String?
        context.exceptionHandler = { _, exception in thrown = exception?.toString() }
        let value = try #require(context.evaluateScript("JSON.stringify(\(literal))"))
        #expect(thrown == nil, Comment(rawValue: thrown ?? ""))
        let roundTripped = try JSONDecoder().decode([SuggestedEdit].self, from: Data(try #require(value.toString()).utf8))
        #expect(roundTripped == Self.nasty)
        // Evaluated as source, the literal yields an array of the right length whose strings are the originals.
        let length = try #require(context.evaluateScript("(\(literal)).length"))
        #expect(length.toInt32() == 3)
        let find = try #require(context.evaluateScript("(\(literal))[1].find"))
        #expect(find.toString() == "</script><script>alert(1)</script>")
        let replace = try #require(context.evaluateScript("(\(literal))[1].replace"))
        #expect(replace.toString() == "a\u{2028}b\u{2029}c")
    }

    @Test func aMissingNoteIsAbsentFromTheLiteralNotNull() {
        let literal = MarkupWKWebView.jsLiteral([SuggestedEdit(block: 0, expected: "h", find: "x", replace: "y")])
        #expect(!literal.contains("note"))
        #expect(!literal.contains("null"))
    }
}
