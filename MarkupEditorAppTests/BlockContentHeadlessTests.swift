//
//  BlockContentHeadlessTests.swift
//  MarkupEditorAppTests
//
//  getBlocks, replaceBlocks and selectText through the Swift bridges against a real headless
//  MarkupWKWebView with the real markupeditor-app.js.

import Testing
import Foundation
import MarkupEditor
import MarkupEditorAppLib
import WebKit
@testable import MarkupEditorApp

@MainActor
struct BlockContentHeadlessTests {

    /// A ready page holding `markdown`. The page is returned too, since it receives the editor's callbacks.
    private static func loaded(_ markdown: String, metadataYAML: String? = nil) async throws -> (page: HeadlessTestPage, webView: MarkupWKWebView) {
        let page = HeadlessTestPage()
        await page.start()
        let webView = try #require(page.webView)
        let imported = try await MarkupConverter.importMarkdownDecoded(webView, content: markdown)
        await withCheckedContinuation { continuation in
            // The app seeds the metadata block ahead of the imported body when the document has metadata.
            let html = metadataYAML.map { "<pre><code class=\"language-metadata\">\($0)</code></pre>" + imported.result } ?? imported.result
            webView.setHtml(html) { continuation.resume() }
        }
        return (page, webView)
    }

    private static func blocks(_ webView: MarkupWKWebView) async throws -> [ContentBlock] {
        try await webView.getBlocks(from: nil, limit: nil).blocks
    }

    private static func replace(_ webView: MarkupWKWebView, _ index: Int, _ count: Int, _ markdown: String, allowLoss: Bool = false, restrictImages: Bool = true) async throws -> ReplaceResult {
        let current = try await webView.getBlocks(from: nil, limit: nil)
        let expected: [String]
        if count > 0 {
            expected = current.blocks[index..<(index + count)].map(\.hash)
        } else {
            expected = index == 0 ? [] : [current.blocks[index - 1].hash]
        }
        return try await webView.replaceBlocks(index: index, count: count, markdown: markdown, expected: expected, allowLoss: allowLoss, restrictImages: restrictImages)
    }

    private static let everyKind = """
    # Heading

    A paragraph.

    * bullet one

    * bullet two

    1. first

    2. second

    | h1 | h2 |
    | --- | --- |
    | a | b |

    ```py
    print(1)
    ```

    > a quote

    ![pic](images/pic.png)
    """

    @Test func everyBlockKindIsDescribed() async throws {
        let (_, webView) = try await Self.loaded(Self.everyKind)
        let page = try await webView.getBlocks(from: nil, limit: nil)
        #expect(page.ok)
        #expect(page.blocks.map(\.kind) == ["heading", "paragraph", "bullet-list", "numbered-list", "table", "code", "quote", "image"])
        #expect(page.blocks.map(\.index) == Array(0..<8))
        #expect(page.firstEditable == 0)
        #expect(page.blocks[0].markdown == "# Heading")
        #expect(page.blocks.allSatisfy { !$0.hash.isEmpty })
    }

    @Test(arguments: [
        (0, "paragraph", "plain text", "paragraph"),
        (0, "heading", "## Sub", "heading"),
        (1, "list", "* x\n\n* y", "bullet-list"),
        (1, "numbered", "1. x\n\n2. y", "numbered-list"),
        (1, "table", "| a | b |\n| --- | --- |\n| 1 | 2 |", "table"),
        (1, "code", "```js\nlet x = 1\n```", "code"),
        (1, "quote", "> quoted", "quote"),
    ])
    func eachKindCanBeWrittenOverABlock(index: Int, name: String, markdown: String, kind: String) async throws {
        let (_, webView) = try await Self.loaded("# Title\n\nbody")
        let result = try await Self.replace(webView, index, 1, markdown)
        #expect(result.ok, Comment(rawValue: "\(name): \(result.reason ?? "")"))
        let now = try await Self.blocks(webView)
        #expect(now[index].kind == kind)
        #expect(now.count == 2)
    }

    @Test func insertAppendAndDeleteWork() async throws {
        let (_, webView) = try await Self.loaded("one\n\ntwo")
        #expect(try await Self.replace(webView, 1, 0, "between").ok)
        #expect(try await Self.blocks(webView).map(\.markdown) == ["one", "between", "two"])
        #expect(try await Self.replace(webView, 3, 0, "last").ok)
        #expect(try await Self.blocks(webView).map(\.markdown) == ["one", "between", "two", "last"])
        #expect(try await Self.replace(webView, 1, 2, "").ok)
        #expect(try await Self.blocks(webView).map(\.markdown) == ["one", "last"])
    }

    @Test func aMarkdownArgumentSurvivesQuotesBackslashesBackticksAndNewlines() async throws {
        let (_, webView) = try await Self.loaded("first\n\nsecond")
        let tricky = "She said \"hi\" and 'bye' with a back\\slash, `code`, a </script> tag,\nand a second line \u{2028} é 🙂"
        let result = try await Self.replace(webView, 1, 1, tricky)
        #expect(result.ok, Comment(rawValue: result.reason ?? ""))
        // The raw tag is unsupported HTML: it is dropped, and the import says so.
        #expect(result.warnings.contains { $0.contains("script") })
        let text = try await Self.blocks(webView)[1].markdown
        for fragment in ["\"hi\"", "'bye'", "back\\\\slash", "`code`", "é 🙂", "second line"] {
            #expect(text.contains(fragment) || text.contains(fragment.replacingOccurrences(of: "\\\\", with: "\\")), Comment(rawValue: "\(fragment) in \(text)"))
        }
    }

    @Test func aStaleReadIsRefusedWithTheCurrentBlocks() async throws {
        let (_, webView) = try await Self.loaded("one\n\ntwo")
        let result = try await webView.replaceBlocks(index: 1, count: 1, markdown: "x", expected: ["0000000000000a"], allowLoss: false)
        #expect(!result.ok)
        #expect(result.reason?.contains("changed since it was read") == true)
        #expect(result.blocks.first?.markdown == "two")
        #expect(try await Self.blocks(webView).map(\.markdown) == ["one", "two"])
    }
    /// The editor tells its host about an edit through the DOM input event; a transaction alone does not
    /// raise one. A listener in the page counts them (the headless page gets no delegate callback for them).
    @Test func aChangeRaisesAnInputEventAndIsOneUndoStep() async throws {
        let (_, webView) = try await Self.loaded("one\n\ntwo")
        _ = try await webView.evaluateJavaScript("""
            window.__inputs = 0
            document.getElementById('markupeditor').MU.activeView().dom.addEventListener('input', () => { window.__inputs++ })
            """)
        #expect(try await Self.replace(webView, 0, 2, "alpha\n\nbeta\n\ngamma").ok)
        let inputs = try await webView.evaluateJavaScript("window.__inputs") as? Int
        #expect(inputs == 1)
        #expect(try await Self.blocks(webView).count == 3)
        await webView.undo()
        #expect(try await Self.blocks(webView).map(\.markdown) == ["one", "two"])
    }

    @Test func aRemoteImageBecomesALinkWithAWarning() async throws {
        let (_, webView) = try await Self.loaded("one")
        let result = try await Self.replace(webView, 0, 1, "![chart](https://example.invalid/chart.png)")
        #expect(result.ok)
        #expect(result.warnings.count == 1)
        #expect(try await Self.blocks(webView)[0].markdown == "[chart](https://example.invalid/chart.png)")
    }

    @Test func aRemoteImageStaysAnImageWhenTheRestrictionIsOff() async throws {
        let (_, webView) = try await Self.loaded("one")
        let result = try await Self.replace(webView, 0, 1, "![chart](https://example.invalid/chart.png)", restrictImages: false)
        #expect(result.ok)
        #expect(result.warnings.isEmpty)
        #expect(try await Self.blocks(webView)[0].kind == "image")
    }

    @Test func frontMatterBlocksCountAndAgreeWithTheSelectionBridges() async throws {
        // Front matter is stripped on import and seeded as a leading metadata block; empty YAML seeds nothing.
        for (source, yaml, expectedMetadata) in [("---\ntitle: Doc\n---\n\nbody one\n\nbody two", "title: Doc", 1), ("---\n---\n\nbody one\n\nbody two", nil, 0)] as [(String, String?, Int)] {
            let (_, webView) = try await Self.loaded(source, metadataYAML: yaml)
            let page = try await webView.getBlocks(from: nil, limit: nil)
            let metadataBlocks = page.blocks.filter { $0.kind == "metadata" }.count
            #expect(page.blocks.count == 2 + metadataBlocks, Comment(rawValue: "kinds \(page.blocks.map(\.kind)) for \(source.debugDescription)"))
            #expect(metadataBlocks == expectedMetadata)
            #expect(page.firstEditable == metadataBlocks)
            for block in page.blocks {
                await webView.selectBlockIndex(block.index)
                #expect(await webView.getSelectionBlockIndex() == block.index, Comment(rawValue: "block \(block.index) of \(source.debugDescription)"))
            }
            // The metadata block reads as its front matter and is replaced like any other block.
            if metadataBlocks > 0 {
                #expect(page.blocks[0].markdown == "---\ntitle: Doc\n---")
                let changed = try await Self.replace(webView, 0, 1, "---\ntitle: New\n---")
                #expect(changed.ok, Comment(rawValue: changed.reason ?? ""))
                #expect(try await Self.blocks(webView)[0].markdown == "---\ntitle: New\n---")
                #expect(changed.metadataRemoved == nil)
            }
        }
    }

    @Test func frontMatterAndAnHTMLHeaderCanBeWrittenChangedAndRemoved() async throws {
        let (_, webView) = try await Self.loaded("body one\n\nbody two")
        let created = try await Self.replace(webView, 0, 0, "---\ntitle: Doc\n---")
        #expect(created.ok, Comment(rawValue: created.reason ?? ""))
        let header = try await Self.replace(webView, 1, 0, "<p align=\"center\">\n  <img src=\"logo.svg\" width=\"96\">\n</p>\n\n# Title")
        #expect(header.ok, Comment(rawValue: header.reason ?? ""))
        #expect(try await Self.blocks(webView).map(\.kind) == ["metadata", "html-preamble", "heading", "paragraph", "paragraph"])
        let removed = try await Self.replace(webView, 0, 1, "")
        #expect(removed.ok)
        #expect(removed.metadataRemoved == true)
        #expect(try await Self.blocks(webView).map(\.kind) == ["html-preamble", "heading", "paragraph", "paragraph"])
        let pushed = try await Self.replace(webView, 0, 0, "A new first paragraph")
        #expect(!pushed.ok)
    }

    @Test func selectTextFindsOccurrencesAndReportsAMiss() async throws {
        let (_, webView) = try await Self.loaded("the cat sat\n\nanother Cat here")
        let first = try await webView.selectText("cat", occurrence: 1)
        #expect(first == SelectionResult(found: true, blockIndex: 0))
        let second = try await webView.selectText("cat", occurrence: 2)
        #expect(second == SelectionResult(found: true, blockIndex: 1))
        #expect(await webView.getSelectionBlockIndex() == 1)
        #expect(try await webView.selectText("cat", occurrence: 3) == SelectionResult(found: false))
        #expect(try await webView.selectText("dog", occurrence: 1) == SelectionResult(found: false))
        #expect(await webView.getSelectionBlockIndex() == 1)
    }

    @Test func pagingReturnsWholeBlocksAndANextIndex() async throws {
        let (_, webView) = try await Self.loaded("aaaa\n\nbbbb\n\ncccc")
        let first = try await webView.getBlocks(from: nil, limit: 6)
        #expect(first.blocks.map(\.markdown) == ["aaaa"])
        #expect(first.next == 1)
        let rest = try await webView.getBlocks(from: 1, limit: nil)
        #expect(rest.blocks.map(\.markdown) == ["bbbb", "cccc"])
        #expect(rest.next == nil)
        let bad = try await webView.getBlocks(from: 99, limit: nil)
        #expect(!bad.ok)
    }
}
