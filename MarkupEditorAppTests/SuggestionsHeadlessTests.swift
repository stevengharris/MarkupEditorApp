//
//  SuggestionsHeadlessTests.swift
//  MarkupEditorAppTests
//
//  proposeEdits and listSuggestions through the Swift bridges against a real headless MarkupWKWebView
//  with the real markupeditor-app.js. The page script plays the user: it accepts, rejects and types.

import Testing
import Foundation
import MarkupEditor
import MarkupEditorAppLib
import WebKit
@testable import MarkupEditorApp

@MainActor
struct SuggestionsHeadlessTests {

    private static let markdown = "# Title\n\nThe cat sat on the mat. The dog ran.\n\nSecond paragraph here."

    private static func loaded(_ markdown: String = markdown) async throws -> (page: HeadlessTestPage, webView: MarkupWKWebView) {
        let page = HeadlessTestPage()
        await page.start()
        let webView = try #require(page.webView)
        let imported = try await MarkupConverter.importMarkdownDecoded(webView, content: markdown)
        await withCheckedContinuation { continuation in webView.setHtml(imported.result) { continuation.resume() } }
        return (page, webView)
    }

    private static func blocks(_ webView: MarkupWKWebView) async throws -> [ContentBlock] {
        try await webView.getBlocks(from: nil, limit: nil).blocks
    }

    /// Block `index` of the document, or a test failure (not a trap) when the document has fewer blocks.
    private static func blockAt(_ webView: MarkupWKWebView, _ index: Int) async throws -> ContentBlock {
        let all = try await blocks(webView)
        try #require(all.indices.contains(index), "block \(index) wanted, but the document has \(all.count) blocks")
        return all[index]
    }

    /// An edit of `find` to `replace` in block `block`, with the hash the editor reports for it now.
    private static func edit(_ webView: MarkupWKWebView, _ block: Int, _ find: String, _ replace: String, note: String? = nil) async throws -> SuggestedEdit {
        let hash = try await blockAt(webView, block).hash
        return SuggestedEdit(block: block, expected: hash, find: find, replace: replace, note: note)
    }

    /// What the user does with the page: runs one of the editor's own suggestion functions.
    @discardableResult
    private static func userRuns(_ webView: MarkupWKWebView, _ call: String) async throws -> String? {
        try await webView.executeJavaScript(call) as? String
    }

    // MARK: Proposing and listing

    @Test func proposedEditsAreListedAsPendingWithTheirIdsAndNotes() async throws {
        let (_, webView) = try await Self.loaded()
        let result = try await webView.proposeEdits([
            try await Self.edit(webView, 1, "cat", "dog", note: "prefer dogs"),
            try await Self.edit(webView, 1, "mat", ""),
        ])
        #expect(result.ok, Comment(rawValue: result.reason ?? ""))
        #expect(result.results.map(\.status) == ["proposed", "proposed"])
        #expect(result.results.map(\.index) == [0, 1])
        #expect(result.results.allSatisfy { $0.block == 1 && $0.id?.isEmpty == false })

        let list = try await webView.listSuggestions()
        #expect(list.ok)
        #expect(list.suggestions.map(\.id) == result.results.compactMap(\.id))
        #expect(list.suggestions.map(\.status) == ["pending", "pending"])
        #expect(list.suggestions.map(\.find) == ["cat", "mat"])
        #expect(list.suggestions.map(\.replace) == ["dog", ""])
        #expect(list.suggestions.map(\.note) == ["prefer dogs", nil])
    }

    @Test func aDocumentWithNoSuggestionsListsNone() async throws {
        let (_, webView) = try await Self.loaded()
        let list = try await webView.listSuggestions()
        #expect(list.ok)
        #expect(list.suggestions.isEmpty)
    }

    @Test func proposingLeavesTheDocumentAndTheEditorsInputCountAlone() async throws {
        let (page, webView) = try await Self.loaded()
        let before = try await Self.blocks(webView)
        let inputs = page.inputCount
        let result = try await webView.proposeEdits([try await Self.edit(webView, 1, "cat", "dog")])
        #expect(result.ok)
        #expect(try await Self.blocks(webView) == before)
        #expect(page.inputCount == inputs)
        #expect(page.inputCount == 0)
    }

    @Test func aRefusedEditComesBackAsAResultNotAThrow() async throws {
        let (_, webView) = try await Self.loaded()
        let good = try await Self.edit(webView, 1, "cat", "dog")
        let missing = try await Self.edit(webView, 1, "Cat", "dog")                      // case-sensitive
        let stale = SuggestedEdit(block: 1, expected: "not-the-hash", find: "mat", replace: "rug")
        let heading = SuggestedEdit(block: 0, expected: try await Self.blockAt(webView, 0).hash, find: "Title", replace: "Name")
        let result = try await webView.proposeEdits([good, missing, stale, heading])
        #expect(result.ok)
        #expect(result.results.map(\.status) == ["proposed", "refused", "refused", "proposed"])
        try #require(result.results.count == 4, "one result per edit")
        #expect(result.results[1].reason?.contains("find not found") == true, Comment(rawValue: result.results[1].reason ?? ""))
        #expect(result.results[2].reason?.hasPrefix("document changed") == true, Comment(rawValue: result.results[2].reason ?? ""))
        #expect(result.results[1].id == nil)
        #expect(try await webView.listSuggestions().suggestions.map(\.find) == ["cat", "Title"])
    }

    @Test func anAmbiguousOrOverlappingEditIsRefusedWithAReason() async throws {
        let (_, webView) = try await Self.loaded("one two one\n\nsecond")
        let twice = try await Self.edit(webView, 0, "one", "1")
        let first = try await Self.edit(webView, 0, "two one", "2 1")
        let overlap = try await Self.edit(webView, 0, "one two", "x")
        let result = try await webView.proposeEdits([twice, first, overlap])
        #expect(result.results.map(\.status) == ["refused", "proposed", "refused"])
        try #require(result.results.count == 3, "one result per edit")
        #expect(result.results[0].reason?.contains("2 times") == true, Comment(rawValue: result.results[0].reason ?? ""))
        #expect(result.results[2].reason?.contains("overlaps") == true, Comment(rawValue: result.results[2].reason ?? ""))
    }

    @Test func anEditAcrossAFormattingBoundaryIsRefusedAndOneBesideItLeavesTheCodeAsCode() async throws {
        let (_, webView) = try await Self.loaded("Basically the `queue` drains in order.\n\nsecond")
        let crossing = try await Self.edit(webView, 0, "Basically the queue drains", "The queue drains")
        let beside = try await Self.edit(webView, 0, "Basically the ", "The ")
        let result = try await webView.proposeEdits([crossing, beside])
        try #require(result.results.count == 2, "one result per edit")
        #expect(result.results.map(\.status) == ["refused", "proposed"])
        #expect(result.results[0].reason?.contains("formatting boundary") == true, Comment(rawValue: result.results[0].reason ?? ""))
        try await Self.userRuns(webView, "MU.acceptAllSuggestions()")
        #expect(try await Self.blockAt(webView, 0).markdown == "The `queue` drains in order.")
    }

    @Test func aWholeCallRefusalIsAResultWithOkFalse() async throws {
        let (_, webView) = try await Self.loaded()
        let result = try await webView.proposeEdits([])
        #expect(!result.ok)
        #expect(result.reason?.contains("1 to 200") == true, Comment(rawValue: result.reason ?? ""))
        #expect(result.results.isEmpty)
    }

    @Test func textThatIsHostileToJavaScriptSurvivesTheBridge() async throws {
        let (_, webView) = try await Self.loaded("say \"hi\" and 'bye' with a back\\slash and </script> tags\n\nsecond")
        let hash = try await Self.blockAt(webView, 0).hash
        let find = "say \"hi\" and 'bye' with a back\\slash"
        let replace = "back\\slash `${1+1}` \u{1F600} x"
        let result = try await webView.proposeEdits([SuggestedEdit(block: 0, expected: hash, find: find, replace: replace, note: "a \"quoted\" </script> note")])
        #expect(result.ok)
        #expect(result.results.first?.status == "proposed", Comment(rawValue: result.results.first?.reason ?? ""))
        let suggestion = try #require(try await webView.listSuggestions().suggestions.first)
        #expect(suggestion.find == find)
        #expect(suggestion.replace == replace)
        #expect(suggestion.note == "a \"quoted\" </script> note")
    }

    @Test func lineBreaksAndControlCharactersInReplaceOrNoteAreRefusedPerEdit() async throws {
        let (_, webView) = try await Self.loaded()
        let hash = try await Self.blockAt(webView, 1).hash
        let result = try await webView.proposeEdits([
            SuggestedEdit(block: 1, expected: hash, find: "cat", replace: "two\nlines"),
            SuggestedEdit(block: 1, expected: hash, find: "cat", replace: "sep\u{2028}arator"),
            SuggestedEdit(block: 1, expected: hash, find: "cat", replace: "dog", note: "a\u{0}nul"),
            SuggestedEdit(block: 1, expected: hash, find: "cat", replace: String(repeating: "x", count: 2001)),
        ])
        #expect(result.ok)
        #expect(result.results.map(\.status) == ["refused", "refused", "refused", "refused"])
        try #require(result.results.count == 4, "one result per edit")
        #expect(result.results[0].reason?.contains("line breaks") == true, Comment(rawValue: result.results[0].reason ?? ""))
        #expect(result.results[3].reason?.contains("2000") == true, Comment(rawValue: result.results[3].reason ?? ""))
        #expect(try await webView.listSuggestions().suggestions.isEmpty)
    }

    // MARK: The user acts

    @Test func acceptingAllAppliesTheReplacementsAndCountsAsAUserEdit() async throws {
        let (page, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([
            try await Self.edit(webView, 1, "cat", "fox"),
            try await Self.edit(webView, 1, "mat", ""),
        ])
        #expect(page.inputCount == 0)
        let reply = try await Self.userRuns(webView, "MU.acceptAllSuggestions()")
        #expect(reply?.contains("\"count\":2") == true, Comment(rawValue: reply ?? "nil"))
        #expect(try await Self.blockAt(webView, 1).markdown == "The fox sat on the . The dog ran.")
        #expect(try await webView.listSuggestions().suggestions.map(\.status) == ["accepted", "accepted"])
        // The host hears about the edit once, as one change.
        for _ in 0..<30 where page.inputCount == 0 { try await Task.sleep(for: .milliseconds(100)) }
        #expect(page.inputCount == 1)
    }

    @Test func rejectingAllLeavesTheDocumentAsItWas() async throws {
        let (page, webView) = try await Self.loaded()
        let before = try await Self.blocks(webView)
        _ = try await webView.proposeEdits([try await Self.edit(webView, 1, "cat", "fox")])
        let reply = try await Self.userRuns(webView, "MU.rejectAllSuggestions()")
        #expect(reply?.contains("\"count\":1") == true, Comment(rawValue: reply ?? "nil"))
        #expect(try await Self.blocks(webView) == before)
        #expect(try await webView.listSuggestions().suggestions.map(\.status) == ["rejected"])
        #expect(page.inputCount == 0)
    }

    @Test func aPendingSuggestionIsNotInTheSavedDocument() async throws {
        let (_, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([try await Self.edit(webView, 1, "cat", "fox")])
        let html = try #require(await webView.getHtml())
        #expect(html.contains("The cat sat"))
        #expect(!html.contains("fox"))
    }

    @Test func theUserTypingInsideASuggestedRangeMakesItStale() async throws {
        let (_, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([try await Self.edit(webView, 1, "cat", "fox")])
        // "The cat": the paragraph starts at 1 + the heading's size, so find the position from the text.
        _ = try await webView.evaluateJavaScript("""
            (() => {
              const view = document.getElementById('markupeditor').MU.activeView()
              let pos = -1
              view.state.doc.descendants((node, p) => { if (node.isText && node.text.startsWith('The cat')) pos = p + 5 })
              view.dispatch(view.state.tr.insertText('X', pos))
            })()
            """)
        let suggestion = try #require(try await webView.listSuggestions().suggestions.first)
        #expect(suggestion.status == "stale")
        #expect(suggestion.reason == "edited")
    }

    @Test func replacingTheWholeDocumentMakesPendingSuggestionsStaleAndKeepsThem() async throws {
        let (_, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([try await Self.edit(webView, 1, "cat", "fox")])
        await withCheckedContinuation { continuation in webView.setHtml("<p>A different document.</p>") { continuation.resume() } }
        let suggestion = try #require(try await webView.listSuggestions().suggestions.first)
        #expect(suggestion.status == "stale")
        #expect(suggestion.reason == "document-replaced")
        #expect(suggestion.find == "cat")
    }

    @Test func undoingAnAcceptRestoresTheTextButTheSuggestionStaysAccepted() async throws {
        let (_, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([try await Self.edit(webView, 1, "cat", "fox")])
        try await Self.userRuns(webView, "MU.acceptAllSuggestions()")
        #expect(try await Self.blockAt(webView, 1).markdown.hasPrefix("The fox"))
        await webView.undo()
        #expect(try await Self.blockAt(webView, 1).markdown.hasPrefix("The cat"))
        #expect(try await webView.listSuggestions().suggestions.map(\.status) == ["accepted"])
    }

    // MARK: Pending count for the Suggestions menu

    @Test func theAppCountsOnlyPendingSuggestions() async throws {
        let (_, webView) = try await Self.loaded()
        #expect(await AppControl.pendingSuggestionCount(in: webView) == 0)
        _ = try await webView.proposeEdits([
            try await Self.edit(webView, 1, "cat", "dog"),
            try await Self.edit(webView, 1, "mat", ""),
        ])
        #expect(await AppControl.pendingSuggestionCount(in: webView) == 2)
        try await Self.userRuns(webView, "MU.rejectAllSuggestions()")
        #expect(await AppControl.pendingSuggestionCount(in: webView) == 0, "rejected suggestions are not pending")
    }

    @Test func aStaleSuggestionIsNotCountedAsPending() async throws {
        let (_, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([try await Self.edit(webView, 1, "cat", "fox")])
        await withCheckedContinuation { continuation in webView.setHtml("<p>A different document.</p>") { continuation.resume() } }
        #expect(await AppControl.pendingSuggestionCount(in: webView) == 0)
    }

    @Test func noEditorHasNoPendingSuggestions() async {
        #expect(await AppControl.pendingSuggestionCount(in: nil) == 0)
    }

    @Test func theSourceSwitchWarnsOnlyWhenSuggestionsArePending() throws {
        #expect(AppControl.sourceSwitchWarning(pending: 0) == nil)
        let one = try #require(AppControl.sourceSwitchWarning(pending: 1))
        #expect(one.detail.contains("1 pending suggestion "), Comment(rawValue: one.detail))
        let three = try #require(AppControl.sourceSwitchWarning(pending: 3))
        #expect(three.detail.contains("3 pending suggestions"), Comment(rawValue: three.detail))
    }

    @Test func theSourceSwitchAlertDefaultsToCancel() throws {
        #expect(AppControl.sourceSwitchAlert(pending: 0) == nil)
        let alert = try #require(AppControl.sourceSwitchAlert(pending: 2))
        alert.layout()
        #expect(alert.buttons.map(\.title) == ["Cancel", "Switch"])
        #expect(alert.window.defaultButtonCell?.title == "Cancel", "a first button titled Cancel is not the default unless Return is assigned to it")
    }

    // MARK: Return and Shift-Return

    /// Presses Return, with Shift when `shift`, in the editor as the user would, through the editor's real key handling.
    private static func userPressesReturn(_ webView: MarkupWKWebView, shift: Bool = false) async throws {
        _ = try await webView.evaluateJavaScript("""
            (() => {
              const view = document.getElementById('markupeditor').MU.activeView()
              view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, shiftKey: \(shift), bubbles: true, cancelable: true }))
            })()
            """)
    }

    @Test func returnAcceptsAndShiftReturnRejectsTheSelectedSuggestionAheadOfTheEditorsOwnKeys() async throws {
        let (_, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([
            try await Self.edit(webView, 1, "cat", "dog"),
            try await Self.edit(webView, 1, "mat", "rug"),
        ])
        let blocksBefore = try await Self.blocks(webView).count

        try await Self.userRuns(webView, "MU.nextSuggestion()")
        try await Self.userPressesReturn(webView)
        #expect(try await Self.blockAt(webView, 1).markdown.hasPrefix("The dog sat on the mat"))
        #expect(try await Self.blocks(webView).count == blocksBefore, "Return did not split the paragraph")

        // Accepting moved on: the second suggestion is already selected.
        try await Self.userPressesReturn(webView, shift: true)
        #expect(try await Self.blockAt(webView, 1).markdown.hasPrefix("The dog sat on the mat"), "rejecting leaves the text")
        let statuses = try await webView.listSuggestions().suggestions.map(\.status)
        #expect(statuses.sorted() == ["accepted", "rejected"], Comment(rawValue: statuses.joined(separator: ",")))
        #expect(await AppControl.pendingSuggestionCount(in: webView) == 0)
    }

    @Test func returnWithNoSuggestionSelectedStillSplitsTheParagraph() async throws {
        let (_, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([try await Self.edit(webView, 1, "cat", "dog")])
        let before = try await Self.blocks(webView).count
        try await Self.userPressesReturn(webView)
        #expect(try await Self.blocks(webView).count == before + 1, "the caret is not on the suggestion, so Return is the editor's")
        #expect(await AppControl.pendingSuggestionCount(in: webView) == 1)
    }

    @Test func theStatusSaysWhetherTheSelectionIsOnAPendingSuggestion() async throws {
        let (_, webView) = try await Self.loaded()
        #expect(await AppControl.suggestionStatus(in: webView) == SuggestionStatus(ok: true, pending: 0, selected: false))
        _ = try await webView.proposeEdits([
            try await Self.edit(webView, 1, "cat", "dog"),
            try await Self.edit(webView, 1, "mat", "rug"),
        ])
        #expect(await AppControl.suggestionStatus(in: webView) == SuggestionStatus(ok: true, pending: 2, selected: false))
        try await Self.userRuns(webView, "MU.nextSuggestion()")
        #expect(await AppControl.suggestionStatus(in: webView) == SuggestionStatus(ok: true, pending: 2, selected: true))
        try await Self.userRuns(webView, "MU.acceptAndNextSuggestion()")
        #expect(try await Self.blockAt(webView, 1).markdown.hasPrefix("The dog sat on the mat"))
        #expect(await AppControl.suggestionStatus(in: webView) == SuggestionStatus(ok: true, pending: 1, selected: true), "the next one is selected")
        try await Self.userRuns(webView, "MU.rejectAndNextSuggestion()")
        #expect(await AppControl.suggestionStatus(in: webView) == SuggestionStatus(ok: true, pending: 0, selected: false))
    }

    @Test func noEditorHasAnEmptyStatus() async {
        #expect(await AppControl.suggestionStatus(in: nil) == SuggestionStatus(ok: true, pending: 0, selected: false))
    }

    @Test func acceptAndPreviousAndRejectAndPreviousSelectTheEarlierSuggestion() async throws {
        let (_, webView) = try await Self.loaded()
        _ = try await webView.proposeEdits([
            try await Self.edit(webView, 1, "cat", "dog"),
            try await Self.edit(webView, 1, "mat", "rug"),
            try await Self.edit(webView, 1, "dog", "fox"),
        ])
        try await Self.userRuns(webView, "MU.nextSuggestion()")
        try await Self.userRuns(webView, "MU.nextSuggestion()")      // the second is selected
        try await Self.userRuns(webView, "MU.acceptAndPreviousSuggestion()")
        #expect(try await Self.blockAt(webView, 1).markdown.hasPrefix("The cat sat on the rug"))
        #expect(await AppControl.suggestionStatus(in: webView) == SuggestionStatus(ok: true, pending: 2, selected: true), "an earlier one is selected")
        try await Self.userRuns(webView, "MU.rejectAndPreviousSuggestion()")
        #expect(await AppControl.pendingSuggestionCount(in: webView) == 1)
        #expect(try await webView.listSuggestions().suggestions.map(\.status).sorted() == ["accepted", "pending", "rejected"])
    }

    @Test func theDiscardWarningAppearsOnlyWithPendingSuggestionsAndCountsThem() throws {
        #expect(AppControl.discardWarning(pending: 0) == nil)
        let one = try #require(AppControl.discardWarning(pending: 1))
        #expect(one.message == "Discard the pending suggestions?")
        #expect(one.detail.contains("1 pending suggestion "), Comment(rawValue: one.detail))
        let three = try #require(AppControl.discardWarning(pending: 3))
        #expect(three.detail.contains("3 pending suggestions"), Comment(rawValue: three.detail))
    }

    @Test func theDiscardAlertDefaultsToCancelAndOffersDiscard() throws {
        #expect(AppControl.discardAlert(pending: 0) == nil)
        let alert = try #require(AppControl.discardAlert(pending: 2))
        alert.layout()
        #expect(alert.buttons.map(\.title) == ["Cancel", "Discard"])
        #expect(alert.window.defaultButtonCell?.title == "Cancel")
    }

    // MARK: Restoring suggestions into a new editor

    @Test func pendingSuggestionsAreRestoredIntoANewEditorHoldingTheSameDocument() async throws {
        let (_, first) = try await Self.loaded()
        _ = try await first.proposeEdits([
            try await Self.edit(first, 1, "cat", "dog", note: "prefer dogs"),
            try await Self.edit(first, 1, "mat", "rug"),
        ])
        let saved = await AppControl.pendingSuggestions(in: first)
        #expect(saved.count == 2)

        let (_, second) = try await Self.loaded()
        #expect(await AppControl.pendingSuggestionCount(in: second) == 0)
        #expect(await AppControl.restoreSuggestions(saved, in: second) == 0, "none were lost")
        let restored = try await second.listSuggestions().suggestions
        #expect(restored.map(\.status) == ["pending", "pending"])
        #expect(restored.map(\.find) == saved.map(\.find))
        #expect(restored.map(\.replace) == saved.map(\.replace))
        #expect(restored.map(\.note) == saved.map(\.note), "the reasons come back with them")
        try await Self.userRuns(second, "MU.acceptAllSuggestions()")
        #expect(try await Self.blockAt(second, 1).markdown.hasPrefix("The dog sat on the rug"))
    }

    @Test func suggestionsThatNoLongerFitTheDocumentAreCountedAsLost() async throws {
        let (_, first) = try await Self.loaded()
        _ = try await first.proposeEdits([try await Self.edit(first, 1, "cat", "dog"), try await Self.edit(first, 1, "mat", "rug")])
        let saved = await AppControl.pendingSuggestions(in: first)

        let (_, other) = try await Self.loaded("# Title\n\nA different document.")
        #expect(await AppControl.restoreSuggestions(saved, in: other) == 2)
        #expect(await AppControl.pendingSuggestionCount(in: other) == 0)
    }

    @Test func restoringNothingLosesNothing() async throws {
        let (_, webView) = try await Self.loaded()
        #expect(await AppControl.restoreSuggestions([], in: webView) == 0)
        #expect(await AppControl.pendingSuggestions(in: nil).isEmpty)
    }

    @Test func theRestoreWarningNamesHowManyWereLost() throws {
        #expect(AppControl.restoreLossWarning(lost: 0, of: 3) == nil)
        let some = try #require(AppControl.restoreLossWarning(lost: 1, of: 3))
        #expect(some.detail.contains("1 of 3 pending suggestions"), Comment(rawValue: some.detail))
    }
}
