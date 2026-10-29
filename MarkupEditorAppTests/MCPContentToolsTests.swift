//
//  MCPContentToolsTests.swift
//  MarkupEditorAppTests
//
//  The content tools end to end: a real headless editor, the app's real facade and dispatcher in
//  the test process, and the bundled `markup mcp` as the assistant's connection. No tool here
//  uses raw JavaScript; the page script only plays the user typing.

import Testing
import Foundation
import MarkupEditor
import MarkupEditorAppLib
import WebKit
@testable import MarkupEditorApp

@MainActor
final class ContentFixture {
    let page: HeadlessTestPage
    let webView: MarkupWKWebView
    let harness: MCPHarness
    let document: MarkupDocument

    private init(page: HeadlessTestPage, webView: MarkupWKWebView, harness: MCPHarness, document: MarkupDocument) {
        self.document = document
        self.page = page
        self.webView = webView
        self.harness = harness
    }

    /// An editor holding `markdown` (with a leading metadata block when `metadataYAML` is given),
    /// selected as the app's current web view, and a connection to it.
    static func start(_ markdown: String, html htmlOverride: String? = nil, metadataYAML: String? = nil, url: URL? = nil, access: ClientAccess = .readWrite) async throws -> ContentFixture {
        let page = HeadlessTestPage()
        await page.start()
        let webView = try #require(page.webView)
        let imported = try await MarkupConverter.importMarkdownDecoded(webView, content: markdown)
        let body = htmlOverride ?? imported.result
        let html = metadataYAML.map { "<pre><code class=\"language-metadata\">\($0)</code></pre>" + body } ?? body
        await withCheckedContinuation { continuation in webView.setHtml(html) { continuation.resume() } }
        let control = AppControl.shared
        let document = MarkupDocument()
        document.url = url
        control.document = document
        control.sourceShowing = false
        control.sourceText = ""
        control.requestSave = {}   // never reach the hosting app's real save panel
        MarkupEditor.selectedWebView = webView
        let harness = try await MCPHarness.start(facade: AppControlFacade(control: control), access: access)
        let fixture = ContentFixture(page: page, webView: webView, harness: harness, document: document)
        fixture.document.hasChanges = false
        return fixture
    }

    func stop() {
        AppControl.shared.requestSave = {}
        harness.stop()
        AppControl.shared.document = nil
        AppControl.shared.sourceShowing = false
        MarkupEditor.selectedWebView = nil
    }

    // MARK: Reading what the tools return

    func read(from: Int? = nil, limit: Int? = nil) async throws -> (blocks: [JSONValue], json: JSONValue) {
        var args: [String: JSONValue] = [:]
        if let from { args["from"] = .number(Double(from)) }
        args["limit"] = .number(Double(limit ?? 10_000_000))   // the tool's own default is smaller
        let outcome = try await harness.call("get_document", .object(args))
        let json = try #require(outcome.json, Comment(rawValue: outcome.text))
        guard case .array(let blocks)? = json["blocks"] else { return ([], json) }
        return (blocks, json)
    }

    func markdowns() async throws -> [String] {
        try await read().blocks.compactMap { $0["markdown"]?.stringValue }
    }

    func hashes(_ range: Range<Int>) async throws -> [String] {
        let blocks = try await read().blocks
        return range.compactMap { blocks[$0]["hash"]?.stringValue }
    }

    /// `replace_blocks` with the hashes read just now.
    @discardableResult
    func replace(_ index: Int, _ count: Int, _ markdown: String, allowLoss: Bool = false) async throws -> ToolOutcome {
        let blocks = try await read().blocks
        let expected: [String]
        if count > 0 {
            expected = (index..<(index + count)).compactMap { blocks[$0]["hash"]?.stringValue }
        } else {
            expected = index == 0 || (blocks.first?["kind"]?.stringValue == "metadata" && index == 1) ? [] : [blocks[index - 1]["hash"]?.stringValue ?? ""]
        }
        return try await harness.call("replace_blocks", [
            "index": .number(Double(index)), "count": .number(Double(count)), "markdown": .string(markdown),
            "expected": .array(expected.map { .string($0) }), "allowLoss": .bool(allowLoss),
        ])
    }
}

@MainActor @Suite(.serialized)
struct MCPContentToolsTests {

    // MARK: Minimum viable scenario

    @Test func theEditingScenarioEndToEnd() async throws {
        let fixture = try await ContentFixture.start("Intro\n\nOld heading text\n\n* one\n\n* two\n\nLast", metadataYAML: "title: Doc")
        defer { fixture.stop() }

        let start = try await fixture.read()
        #expect(start.json["firstEditable"] == 1)
        #expect(start.json["view"] == "editor")
        #expect(start.blocks.map { $0["kind"]?.stringValue } == ["metadata", "paragraph", "paragraph", "bullet-list", "paragraph"])

        // paragraph -> heading plus a list
        let step1 = try await fixture.replace(2, 1, "## Heading\n\n* a\n\n* b")
        #expect(step1.json?["ok"] == true, Comment(rawValue: step1.text))
        #expect(try await fixture.markdowns().dropFirst().first(where: { $0.hasPrefix("##") }) == "## Heading")
        #expect(try await fixture.read().blocks.map { $0["kind"]?.stringValue }.contains("bullet-list"))

        // heading -> paragraph
        let headingIndex = try #require(try await fixture.read().blocks.firstIndex { $0["kind"] == "heading" })
        #expect(try await fixture.replace(headingIndex, 1, "Plain again").json?["ok"] == true)
        #expect(try await fixture.markdowns().contains("Plain again"))

        // insert right after a list, then append after the last block
        let listIndex = try #require(try await fixture.read().blocks.lastIndex { $0["kind"] == "bullet-list" })
        #expect(try await fixture.replace(listIndex + 1, 0, "After the list").json?["ok"] == true)
        let count = try await fixture.read().blocks.count
        #expect(try await fixture.replace(count, 0, "Appended").json?["ok"] == true)
        #expect(try await fixture.markdowns().last == "Appended")

        // delete
        let appended = try await fixture.read().blocks.count - 1
        #expect(try await fixture.replace(appended, 1, "").json?["ok"] == true)
        #expect(try await fixture.markdowns().last != "Appended")

        // stale
        let stale = try await fixture.harness.call("replace_blocks", ["index": 1, "count": 1, "markdown": "x", "expected": ["00000000000000"]])
        #expect(stale.json?["ok"] == false)
        #expect(stale.json?["blocks"] != nil)

        // one undo reverses the delete
        let beforeUndo = try await fixture.markdowns()
        #expect(try await fixture.harness.call("undo").isError == false)
        #expect(try await fixture.markdowns() != beforeUndo)
        #expect(try await fixture.markdowns().last == "Appended")

        // the metadata block is protected
        let metadataHash = try await fixture.hashes(0..<1)[0]
        let metadata = try await fixture.harness.call("replace_blocks", ["index": 0, "count": 1, "markdown": "x", "expected": [.string(metadataHash)]])
        #expect(metadata.isError || metadata.json?["ok"] == false)
        let beforeStart = try await fixture.harness.call("replace_blocks", ["index": 0, "count": 0, "markdown": "x", "expected": []])
        #expect(beforeStart.isError || beforeStart.json?["ok"] == false)

        // unsupported raw HTML after the first block is dropped with a named warning
        let html = try await fixture.replace(1, 1, "Text\n\n<div>raw</div>\n\nmore")
        #expect(html.json?["ok"] == true)
        #expect(html.json?["warnings"]?[0]?.stringValue?.contains("Raw HTML") == true, Comment(rawValue: html.text))
    }

    // MARK: Reading and selecting

    @Test func readingPagesAndFormats() async throws {
        let fixture = try await ContentFixture.start("aaaa\n\nbbbb\n\ncccc")
        defer { fixture.stop() }
        let page = try await fixture.read(limit: 6)
        #expect(page.blocks.count == 1)
        #expect(page.json["next"] == 1)
        let rest = try await fixture.read(from: 1)
        #expect(rest.blocks.count == 2)
        #expect(rest.json["next"] == nil)
        let html = try await fixture.harness.call("get_document", ["format": "html"])
        #expect(html.json?["html"]?.stringValue?.contains("<p>aaaa</p>") == true)
        #expect(html.json?["blocks"] == nil)
        #expect(try await fixture.harness.call("get_document", ["from": 99]).isError)
    }

    @Test func selectingByBlockAndByTextMovesTheSelection() async throws {
        let fixture = try await ContentFixture.start("the cat sat\n\nanother Cat here")
        defer { fixture.stop() }
        #expect(try await fixture.harness.call("select", ["block": 1]).json?["found"] == true)
        #expect(try await fixture.harness.call("get_selection").json?["blockIndex"] == 1)
        let second = try await fixture.harness.call("select", ["text": "cat", "occurrence": 2])
        #expect(second.json == ["found": true, "blockIndex": 1])
        let selection = try await fixture.harness.call("get_selection")
        #expect(selection.json?["text"]?.stringValue?.lowercased() == "cat")
        #expect(try await fixture.harness.call("select", ["text": "cat", "occurrence": 3]).json == ["found": false])
        #expect(try await fixture.harness.call("select", ["block": 9]).isError)
        #expect(try await fixture.harness.call("get_selection").json?["blockIndex"] == 1)
    }

    // MARK: Writing

    @Test func argumentsAreCheckedBeforeAnythingRuns() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo")
        defer { fixture.stop() }
        let bad: [(String, JSONValue)] = [
            ("replace_blocks", ["index": -1, "count": 1, "markdown": "x", "expected": ["h"]]),
            ("replace_blocks", ["index": 0, "count": 1.5, "markdown": "x", "expected": ["h"]]),
            ("replace_blocks", ["index": 0, "count": 1, "markdown": "x"]),
            ("replace_blocks", ["index": 0, "count": 1, "markdown": "x", "expected": "h"]),
            ("replace_blocks", ["index": 99, "count": 0, "markdown": "x", "expected": []]),
            ("replace_blocks", ["index": 1, "count": 5, "markdown": "x", "expected": ["h"]]),
            ("select", [:]),
            ("get_document", ["limit": 0]),
        ]
        for (tool, args) in bad {
            let outcome = try await fixture.harness.call(tool, args)
            #expect(outcome.isError, Comment(rawValue: "\(tool) \(args)"))
        }
        #expect(try await fixture.markdowns() == ["one", "two"])
    }

    @Test func deletingEveryBlockOrLeavingNoEditableBlockIsRefused() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo")
        defer { fixture.stop() }
        let all = try await fixture.replace(0, 2, "")
        #expect(all.isError || all.json?["ok"] == false)
        #expect(try await fixture.markdowns() == ["one", "two"])
    }

    @Test func aLossyBlockNeedsAllowLoss() async throws {
        let fixture = try await ContentFixture.start("", html: "<p>plain</p><p><u>under</u> line</p>")
        defer { fixture.stop() }
        let blocks = try await fixture.read().blocks
        guard let lossy = blocks.firstIndex(where: { if case .array(let w)? = $0["warnings"] { return !w.isEmpty } else { return false } }) else {
            Issue.record("the underline block raised no export warning")
            return
        }
        let refused = try await fixture.replace(lossy, 1, "changed")
        #expect(refused.isError || refused.json?["ok"] == false)
        #expect(try await fixture.replace(lossy, 1, "changed", allowLoss: true).json?["ok"] == true)
    }

    @Test func curlyQuotesInAssistantMarkdownArriveStraight() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo", url: URL(fileURLWithPath: "/tmp/x.md"))
        defer { fixture.stop() }
        _ = try await fixture.replace(1, 1, "It\u{2019}s \u{201C}quoted\u{201D}")
        #expect(try await fixture.markdowns()[1] == "It's \"quoted\"")
    }

    @Test func aRemoteImageArrivesAsALinkWithAWarning() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo")
        defer { fixture.stop() }
        let outcome = try await fixture.replace(1, 1, "![chart](https://example.invalid/c.png)")
        #expect(outcome.json?["warnings"]?[0]?.stringValue?.contains("converted to a link") == true, Comment(rawValue: outcome.text))
        #expect(try await fixture.markdowns()[1] == "[chart](https://example.invalid/c.png)")
        let local = try await fixture.replace(1, 1, "![pic](images/pic.png)")
        #expect(local.json?["warnings"] == [])
        #expect(try await fixture.read().blocks[1]["kind"] == "image")
    }

    // Two writes that read the same blocks: one applies and the other is refused as stale with the current
    // blocks. (The editor runs one JavaScript call at a time; EditQueueTests covers the queue itself.)
    @Test func twoWritesFromTheSameReadCannotBothApply() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo")
        defer { fixture.stop() }
        let hash = try await fixture.hashes(1..<2)
        let args: (String) -> JSONValue = { ["index": 1, "count": 1, "markdown": .string($0), "expected": .array(hash.map { .string($0) })] }
        let firstArgs = args("first writer"), secondArgs = args("second writer")
        async let first = fixture.harness.call("replace_blocks", firstArgs)
        async let second = fixture.harness.call("replace_blocks", secondArgs)
        let outcomes = try await [first, second]
        let accepted = outcomes.filter { $0.json?["ok"] == true }
        #expect(accepted.count == 1, Comment(rawValue: outcomes.map(\.text).joined(separator: " | ")))
        let refused = outcomes.filter { $0.json?["ok"] == false }
        #expect(refused.count == 1)
        #expect(refused.first?.json?["blocks"] != nil)
    }

    @Test func undoReversesTheUsersTypingToo() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo")
        defer { fixture.stop() }
        _ = try await fixture.webView.evaluateJavaScript("""
            (() => { const view = document.getElementById('markupeditor').MU.activeView()
              view.dispatch(view.state.tr.insertText('TYPED ', 1)) })()
            """)
        #expect(try await fixture.markdowns()[0] == "TYPED one")
        #expect(try await fixture.harness.call("undo").isError == false)
        #expect(try await fixture.markdowns()[0] == "one")
        #expect(try await fixture.harness.call("redo").isError == false)
        #expect(try await fixture.markdowns()[0] == "TYPED one")
        let nothing = try await fixture.harness.call("redo")
        #expect(nothing.isError)
    }

    // MARK: Suggestions

    /// A `propose_edits` argument for one edit, with the block's hash read just now.
    private func proposal(_ fixture: ContentFixture, block: Int, find: String, replace: String, note: String? = nil) async throws -> JSONValue {
        let hash = try await fixture.hashes(block..<(block + 1))[0]
        var edit: [String: JSONValue] = ["block": .number(Double(block)), "expected": .string(hash), "find": .string(find), "replace": .string(replace)]
        if let note { edit["note"] = .string(note) }
        return ["edits": [.object(edit)]]
    }

    @Test func proposingThroughTheAssistantsConnectionReturnsIdsAndListsThemPending() async throws {
        let fixture = try await ContentFixture.start("Intro\n\nThe cat sat on the mat.", url: URL(fileURLWithPath: "/tmp/x.md"))
        defer { fixture.stop() }
        let before = try await fixture.markdowns()
        let outcome = try await fixture.harness.call("propose_edits", try await proposal(fixture, block: 1, find: "cat", replace: "dog", note: "prefer dogs"))
        #expect(outcome.isError == false, Comment(rawValue: outcome.text))
        #expect(outcome.json?["ok"] == true)
        #expect(outcome.json?["results"]?[0]?["status"] == "proposed")
        let id = try #require(outcome.json?["results"]?[0]?["id"]?.stringValue)
        #expect(try await fixture.markdowns() == before)

        let listed = try await fixture.harness.call("list_suggestions")
        #expect(listed.json?["ok"] == true)
        let first = try #require(listed.json?["suggestions"]?[0])
        #expect(first["id"]?.stringValue == id)
        #expect(first["status"] == "pending")
        #expect(first["find"] == "cat" && first["replace"] == "dog" && first["note"] == "prefer dogs")
    }

    @Test func aRefusedEditIsAReplyAndNeverAToolError() async throws {
        let fixture = try await ContentFixture.start("Intro\n\nThe cat sat.", url: URL(fileURLWithPath: "/tmp/x.md"))
        defer { fixture.stop() }
        let outcome = try await fixture.harness.call("propose_edits", try await proposal(fixture, block: 1, find: "zebra", replace: "dog"))
        #expect(outcome.isError == false, Comment(rawValue: outcome.text))
        #expect(outcome.json?["ok"] == true)
        #expect(outcome.json?["results"]?[0]?["status"] == "refused")
        #expect(outcome.json?["results"]?[0]?["reason"]?.stringValue?.contains("find not found") == true)
    }

    @Test func badProposeArgumentsAreRefusedBeforeAnythingRuns() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo")
        defer { fixture.stop() }
        let bad: [JSONValue] = [
            [:], ["edits": []],
            ["edits": [["block": 0, "expected": "h", "find": "", "replace": "x"]]],
            ["edits": [["block": -1, "expected": "h", "find": "one", "replace": "x"]]],
            ["edits": [["block": 0, "expected": "h", "find": "one"]]],
        ]
        for args in bad {
            let outcome = try await fixture.harness.call("propose_edits", args)
            #expect(outcome.isError, Comment(rawValue: "\(args)"))
        }
        #expect(try await fixture.harness.call("list_suggestions").json?["suggestions"] == [])
    }

    @Test func curlyQuotesInReplaceArriveStraightButFindStillMatchesCurlyQuotesInTheDocument() async throws {
        let fixture = try await ContentFixture.start("", html: "<p>Intro</p><p>It\u{2019}s a \u{201C}fine\u{201D} day.</p>", url: URL(fileURLWithPath: "/tmp/x.md"))
        defer { fixture.stop() }
        let args = try await proposal(fixture, block: 1, find: "It\u{2019}s a \u{201C}fine\u{201D} day", replace: "It\u{2019}s a \u{201C}grand\u{201D} day")
        let outcome = try await fixture.harness.call("propose_edits", args)
        #expect(outcome.json?["results"]?[0]?["status"] == "proposed", Comment(rawValue: outcome.text))
        // The suggestion keeps what the assistant asked to find; the replacement was normalized like replace_blocks writes.
        let suggestion = try #require(try await fixture.harness.call("list_suggestions").json?["suggestions"]?[0])
        #expect(suggestion["find"] == "It\u{2019}s a \u{201C}fine\u{201D} day")
        #expect(suggestion["replace"] == "It's a \"grand\" day")
        // The user accepts in the page.
        _ = try await fixture.webView.executeJavaScript("MU.acceptAllSuggestions()")
        #expect(try await fixture.markdowns()[1] == "It's a \"grand\" day.")
    }

    @Test func aStraightQuoteFindDoesNotMatchACurlyQuoteInTheDocument() async throws {
        let fixture = try await ContentFixture.start("", html: "<p>Intro</p><p>It\u{2019}s fine.</p>", url: URL(fileURLWithPath: "/tmp/x.md"))
        defer { fixture.stop() }
        let outcome = try await fixture.harness.call("propose_edits", try await proposal(fixture, block: 1, find: "It's", replace: "It is"))
        #expect(outcome.json?["results"]?[0]?["status"] == "refused", Comment(rawValue: outcome.text))
    }

    // propose_edits runs on the same queue as replace_blocks, so the two cannot interleave. Whichever the queue runs first,
    // the pair must end in a state that order explains.
    @Test func proposeEditsAndReplaceBlocksRunInQueueOrder() async throws {
        let fixture = try await ContentFixture.start("Intro\n\nThe cat sat.\n\nThird", url: URL(fileURLWithPath: "/tmp/x.md"))
        defer { fixture.stop() }
        let hashes = try await fixture.hashes(1..<2)
        let proposeArgs: JSONValue = ["edits": [["block": 1, "expected": .string(hashes[0]), "find": "cat", "replace": "dog"]]]
        let replaceArgs: JSONValue = ["index": 1, "count": 1, "markdown": "Brand new text", "expected": .array(hashes.map { .string($0) })]
        async let proposed = fixture.harness.call("propose_edits", proposeArgs)
        async let replaced = fixture.harness.call("replace_blocks", replaceArgs)
        let (propose, replace) = try await (proposed, replaced)
        #expect(replace.json?["ok"] == true, Comment(rawValue: replace.text))
        let status = propose.json?["results"]?[0]?["status"]
        let listed = try #require(try await fixture.harness.call("list_suggestions").json?["suggestions"])
        if status == "proposed" {
            // propose_edits ran first; replace_blocks then rewrote the block under it.
            #expect(listed[0]?["status"] == "stale", Comment(rawValue: "\(propose.text) | \(replace.text)"))
        } else {
            // replace_blocks ran first; the hash propose_edits was given no longer matched.
            #expect(status == "refused", Comment(rawValue: propose.text))
            #expect(propose.json?["results"]?[0]?["reason"]?.stringValue?.hasPrefix("document changed") == true, Comment(rawValue: propose.text))
            #expect(listed == [])
        }
        #expect(try await fixture.markdowns()[1] == "Brand new text")
    }

    // MARK: Source view

    @Test func theSourceViewIsReadableAndEverythingElseRefusesNamingIt() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo")
        defer { fixture.stop() }
        AppControl.shared.sourceShowing = true
        AppControl.shared.sourceText = "# the source text"
        let read = try await fixture.harness.call("get_document")
        #expect(read.json?["view"] == "source")
        #expect(read.json?["source"] == "# the source text")
        #expect(read.json?["blocks"] == nil)
        let refusals: [(String, JSONValue)] = [
            ("get_selection", [:]), ("select", ["block": 0]), ("undo", [:]), ("redo", [:]), ("save_document", [:]),
            ("replace_blocks", ["index": 0, "count": 1, "markdown": "x", "expected": ["h"]]),
            ("propose_edits", ["edits": [["block": 0, "expected": "h", "find": "one", "replace": "1"]]]),
            ("list_suggestions", [:]),
        ]
        for (tool, args) in refusals {
            let outcome = try await fixture.harness.call(tool, args)
            #expect(outcome.isError, Comment(rawValue: tool))
            #expect(outcome.text.contains("source view"), Comment(rawValue: "\(tool): \(outcome.text)"))
        }
    }

    // MARK: Access

    @Test func aReadOnlyClientCanReadAndShowButNotChangeOrSave() async throws {
        let fixture = try await ContentFixture.start("one\n\ntwo", access: .read)
        defer { fixture.stop() }
        #expect(try await fixture.harness.call("get_document").isError == false)
        #expect(try await fixture.harness.call("get_selection").isError == false)
        #expect(try await fixture.harness.call("select", ["block": 1]).isError == false)
        #expect(try await fixture.harness.call("list_suggestions").isError == false)
        let writes: [(String, JSONValue)] = [
            ("replace_blocks", ["index": 0, "count": 1, "markdown": "x", "expected": ["h"]]),
            ("propose_edits", ["edits": [["block": 0, "expected": "h", "find": "one", "replace": "1"]]]),
            ("undo", [:]), ("redo", [:]), ("save_document", [:]),
        ]
        for (tool, args) in writes {
            let outcome = try await fixture.harness.call(tool, args)
            #expect(outcome.isError, Comment(rawValue: tool))
            #expect(outcome.text.contains("read-only"), Comment(rawValue: "\(tool): \(outcome.text)"))
        }
        #expect(try await fixture.markdowns() == ["one", "two"])
        let names = try await fixture.harness.toolNames()
        #expect(!names.contains("eval_js") && !names.contains("run_menu_command"))
    }

    // MARK: Save

    @Test func savingRefusesAnUntitledDocumentAndOneWithNoChanges() async throws {
        let untitled = try await ContentFixture.start("one")
        defer { untitled.stop() }
        untitled.document.hasChanges = true
        let a = try await untitled.harness.call("save_document")
        #expect(a.isError && a.text.contains("not been saved"), Comment(rawValue: a.text))

        let unchanged = try await ContentFixture.start("one", url: URL(fileURLWithPath: "/tmp/x.md"))
        defer { unchanged.stop() }
        let b = try await unchanged.harness.call("save_document")
        #expect(b.isError && b.text.contains("no unsaved changes"), Comment(rawValue: b.text))
    }

    @Test func savingAsksTheDocumentViewToSaveAndWaitsForTheUnsavedFlagToClear() async throws {
        let url = URL(fileURLWithPath: "/tmp/x.md")
        let fixture = try await ContentFixture.start("one", url: url)
        defer { fixture.stop() }

        // A stand-in for the document view's save: clears the flag a moment after the request. The real
        // notification is never posted, so the running app can not show a save panel.
        var saves = 0
        AppControl.shared.requestSave = {
            saves += 1
            let document = fixture.document
            Task { @MainActor in
                try? await Task.sleep(for: .milliseconds(300))
                document.hasChanges = false
            }
        }

        // An edit through the tool sets the unsaved flag by itself.
        _ = try await fixture.replace(0, 1, "changed")
        // The editor reports the edit to its host asynchronously.
        for _ in 0..<30 where !fixture.document.hasChanges { try await Task.sleep(for: .milliseconds(100)) }
        #expect(fixture.document.hasChanges)

        let saved = try await fixture.harness.call("save_document")
        #expect(saved.json?["saved"] == true, Comment(rawValue: saved.text))
        #expect(saved.json?["url"]?.stringValue?.hasSuffix("/tmp/x.md") == true)
        #expect(saves == 1)
        #expect(!fixture.document.hasChanges)
    }

    // MARK: Large documents

    @Test func aLargeDocumentIsReadAndEditedInReasonableTime() async throws {
        var parts: [String] = []
        for i in 0..<1500 {
            parts.append("## Section \(i)")
            parts.append("Paragraph \(i) with some **bold** text, a [link](https://example.com/\(i)) and enough words to be a realistic line of prose in a long document.")
            parts.append("* item \(i).1\n\n* item \(i).2")
            parts.append("| a | b |\n| --- | --- |\n| \(i) | x |")
        }
        let fixture = try await ContentFixture.start(parts.joined(separator: "\n\n"))
        defer { fixture.stop() }

        let clock = ContinuousClock()
        var full: (blocks: [JSONValue], json: JSONValue) = ([], [:])
        let fullTime = try await clock.measure { full = try await fixture.read(limit: 10_000_000) }
        #expect(full.blocks.count == 6000)

        var pages = 0
        var from = 0
        let pagedTime = try await clock.measure {
            while true {
                let page = try await fixture.read(from: from, limit: 20_000)
                pages += 1
                guard let next = page.json["next"]?.intValue else { break }
                from = next
            }
        }
        // Every page holds whole blocks, so reading in pages reaches the same end.
        #expect(pages > 1)

        let replaceTime = try await clock.measure {
            let outcome = try await fixture.replace(3000, 1, "Replaced paragraph")
            #expect(outcome.json?["ok"] == true, Comment(rawValue: outcome.text))
        }
        // A read with no limit stops at the default and says where to continue.
        let defaultedJSON = try #require(try await fixture.harness.call("get_document").json)
        guard case .array(let defaultedBlocks)? = defaultedJSON["blocks"] else { Issue.record("no blocks"); return }
        let defaulted = (blocks: defaultedBlocks, json: defaultedJSON)
        let defaultedBytes = defaulted.blocks.compactMap { $0["markdown"]?.stringValue }.reduce(0) { $0 + $1.count }
        #expect(defaulted.json["next"] != nil)
        #expect(defaultedBytes <= AppControlFacade.defaultDocumentLimit)
        #expect(defaulted.blocks.count < 6000)
        #expect(defaulted.json["next"]?.intValue == defaulted.blocks.count)
        #expect(fullTime < .seconds(30))
        #expect(replaceTime < .seconds(30))
    }
}

private extension JSONValue {
    subscript(index: Int) -> JSONValue? {
        guard case .array(let items) = self, items.indices.contains(index) else { return nil }
        return items[index]
    }
}
