//
//  BlocksReplyTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
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
