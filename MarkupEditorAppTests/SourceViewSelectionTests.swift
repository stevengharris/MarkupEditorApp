//
//  SourceViewSelectionTests.swift
//  MarkupEditorAppTests
//
//  SourceView's selection binding and pending-offset restoration. Two independent
//  concerns, tested separately:
//
//  1. Pure offset -> AttributedString.Index conversion (SourceView.attributedIndex(in:
//     forUTF16Offset:)) -- no hosting needed, exercises the exact UTF-16-based logic
//     production code uses, including a real emoji case that would fail if the
//     implementation used Character/grapheme counting instead.
//
//  2. The dirty-flag ("document.hasChanges") regression: does SourceView's real
//     onAppear -> highlight(source) -> attributedSource reassignment spuriously mark an
//     unmodified document dirty, with or without a pending offset being applied on top?
//     This needs a live-hosted SourceView, since @State/.onChange/.onAppear only run in
//     a real SwiftUI render pass. Deliberately does NOT reuse
//     SourceSelectionSpikeTests.swift's standalone mirror harness -- this suite hosts
//     the REAL, production SourceView.
//
//  Hosting technique (window creation, teardown, run-loop pumping) is copied from
//  SourceSelectionSpikeTests.swift's HostedTextEditorSelectionTests, which found and
//  fixed two process-hang causes (see that file's comments for the full story):
//    - window.close() with a .closable/.titled styleMask can SIGSEGV
//      (-[_NSWindowTransformAnimation dealloc]) -- never call it; use orderOut or, if
//      this is the process's only window, don't even order it out (see below).
//    - RunLoop.main.run(until:) from inside a @MainActor Swift Testing test can hang
//      the entire process when another suite has concurrent async MainActor work
//      pending -- use Task.sleep instead, which suspends the Task without recursing
//      into the run loop.
//    - Never let the visible-window count hit zero: AppDelegate quits the app when the
//      last window closes, and in this headless test host nothing replies to the
//      resulting termination request, hanging forever. Leave every test's window open
//      (leaked, harmless for a short-lived test process).
//

import Testing
import SwiftUI
import AppKit
@testable import MarkupEditorApp

// MARK: - 1. Pure offset -> AttributedString.Index conversion

@MainActor
@Suite struct SourceViewAttributedIndexTests {

    @Test func offsetAtStartProducesStartIndex() {
        let text = AttributedString("Hello, world!")
        let idx = SourceView.attributedIndex(in: text, forUTF16Offset: 0)
        #expect(idx == text.startIndex)
    }

    @Test func offsetInsideTextPlacesInsertionPointCorrectly() {
        let text = AttributedString("Hello, world!")
        let idx = SourceView.attributedIndex(in: text, forUTF16Offset: 7)
        let selection = AttributedTextSelection(insertionPoint: idx)
        guard case .insertionPoint(let resultIdx) = selection.indices(in: text) else {
            Issue.record("expected .insertionPoint, got .ranges")
            return
        }
        let resultOffset = text.utf16.distance(from: text.startIndex, to: resultIdx)
        #expect(resultOffset == 7)
    }

    @Test func negativeOffsetClampsToStartIndex() {
        let text = AttributedString("Hi")
        let idx = SourceView.attributedIndex(in: text, forUTF16Offset: -5)
        #expect(idx == text.startIndex)
    }

    @Test func outOfBoundsOffsetClampsToEndIndex() {
        let text = AttributedString("Hi")
        let idx = SourceView.attributedIndex(in: text, forUTF16Offset: 100)
        #expect(idx == text.endIndex)
    }

    @Test func offsetOnEmptyStringProducesStartIndex() {
        let text = AttributedString("")
        let idx = SourceView.attributedIndex(in: text, forUTF16Offset: 3)
        #expect(idx == text.startIndex)
        #expect(idx == text.endIndex)
    }

    // The critical unit-correctness test: U+1F389 (PARTY POPPER) is a surrogate pair --
    // 2 UTF-16 code units, but 1 Character/grapheme cluster. An offset landing AFTER the
    // emoji must be interpreted as a UTF-16 offset (matching what blocks.js and the
    // Swift bridge produce), not a Character offset -- if attributedIndex used
    // text.characters.index(_:offsetBy:) instead of text.utf16.index(_:offsetBy:), this
    // offset would resolve one position too early (into the emoji itself, not past it),
    // since Characters and UTF-16 code units diverge by exactly one here.
    @Test func offsetAfterNonBMPCharacterUsesUTF16CodeUnitsNotCharacterCount() {
        let text = AttributedString("Hi \u{1F389} there")
        // "Hi " = 3 UTF-16 units, emoji = 2 UTF-16 units (surrogate pair) -> offset 5 is
        // the space immediately after the emoji, offset 6 is 't' of "there".
        let utf16Offset = 6
        let idx = SourceView.attributedIndex(in: text, forUTF16Offset: utf16Offset)

        // Confirm this offset is NOT the same position a Character-based (grapheme)
        // index(_:offsetBy:) would produce for the same raw integer -- if it were, the
        // implementation would be using the wrong unit.
        let wrongCharacterBasedIdx = text.characters.index(text.startIndex, offsetBy: utf16Offset)
        #expect(idx != wrongCharacterBasedIdx, "UTF-16-based and Character-based indices must diverge here, given the surrogate-pair emoji")

        // Confirm the UTF-16-based index actually lands on 't' (start of "there"), not
        // one code unit early (which would land inside/before the emoji).
        let selection = AttributedTextSelection(insertionPoint: idx)
        guard case .insertionPoint(let resultIdx) = selection.indices(in: text) else {
            Issue.record("expected .insertionPoint, got .ranges")
            return
        }
        let remainder = String(text.characters[resultIdx...])
        #expect(remainder == "there")
    }
}

// MARK: - 1a2. Pure AttributedTextSelection -> UTF-16 offset conversion (the inverse of
// attributedIndex, used to capture the SourceView cursor position when toggling away
// from source)

@MainActor
@Suite struct SourceViewUTF16OffsetTests {

    @Test func insertionPointRoundTripsThroughAttributedIndexAndBack() {
        let text = AttributedString("Hello, world!")
        for offset in [0, 5, 7, 13] {
            let idx = SourceView.attributedIndex(in: text, forUTF16Offset: offset)
            let selection = AttributedTextSelection(insertionPoint: idx)
            let result = SourceView.utf16Offset(of: selection, in: text)
            #expect(result == offset)
        }
    }

    @Test func nonBMPCharacterRoundTripsCorrectly() {
        // Same emoji case as offsetAfterNonBMPCharacterUsesUTF16CodeUnitsNotCharacterCount
        // above, but round-tripped the other direction: an index built from a UTF-16
        // offset must report that SAME UTF-16 offset back out, not a Character-based one.
        let text = AttributedString("Hi \u{1F389} there")
        let idx = SourceView.attributedIndex(in: text, forUTF16Offset: 6)
        let selection = AttributedTextSelection(insertionPoint: idx)
        #expect(SourceView.utf16Offset(of: selection, in: text) == 6)
    }

    @Test func rangeSelectionUsesTheStartOfTheFirstRangeAsASingleOffsetProxy() {
        let text = AttributedString("Hello, world!")
        let start = SourceView.attributedIndex(in: text, forUTF16Offset: 2)
        let end = SourceView.attributedIndex(in: text, forUTF16Offset: 9)
        let selection = AttributedTextSelection(range: start..<end)
        #expect(SourceView.utf16Offset(of: selection, in: text) == 2)
    }
}

// MARK: - 1b. Pure isGenuineEdit tests (the dirty-flag guard's decision logic)

@MainActor
@Suite struct SourceViewIsGenuineEditTests {

    @Test func differingContentIsAGenuineEdit() {
        // Falsifier for the hosted dirty-flag tests below: if this were false, the guard
        // would be over-broad and mask real edits too, making "appearing doesn't dirty"
        // trivially true for the wrong reason (nothing ever dirties).
        #expect(SourceView.isGenuineEdit(newAttributedSource: AttributedString("edited text"), currentSource: "original text") == true)
    }

    @Test func matchingContentIsNotAGenuineEdit() {
        #expect(SourceView.isGenuineEdit(newAttributedSource: AttributedString("same text"), currentSource: "same text") == false)
    }

    @Test func matchingContentWithDifferentHighlightingAttributesIsNotAGenuineEdit() {
        // This is the actual case .onAppear's re-highlight hits: same underlying text,
        // different (or newly-added) attribute runs. AttributedString equality includes
        // attributes, so a naive `newAttributedSource != oldAttributedSource` comparison
        // would call this a change; isGenuineEdit must not.
        var highlighted = AttributedString("same text")
        highlighted.foregroundColor = .red
        #expect(SourceView.isGenuineEdit(newAttributedSource: highlighted, currentSource: "same text") == false)
    }
}

// MARK: - 2. Live-hosted SourceView: does appearing (with/without a pending offset) dirty an unmodified document?

/// Reference-type box for SourceView's `source`/`pendingOffset` bindings. Must be
/// `@Observable`, not a plain class: a `Binding(get:set:)` closure over a plain class's
/// property gives SwiftUI's view graph no way to detect a change made from outside a
/// SwiftUI transaction, so an external `state.text = ...` write never reaches the
/// hosted view (no re-render, no onChange).
@Observable
@MainActor
private final class SourceBox {
    var source: String
    var pendingOffset: Int?
    var currentOffset: Int?
    init(source: String, pendingOffset: Int? = nil) {
        self.source = source
        self.pendingOffset = pendingOffset
    }
}

@MainActor
private struct HostedSourceView {
    let window: NSWindow
    let hostingView: NSHostingView<SourceView>
}

@MainActor
private func makeHostedSourceView(document: MarkupDocument, box: SourceBox) -> HostedSourceView {
    let sourceBinding = Binding(get: { box.source }, set: { box.source = $0 })
    let pendingOffsetBinding = Binding(get: { box.pendingOffset }, set: { box.pendingOffset = $0 })
    let currentOffsetBinding = Binding(get: { box.currentOffset }, set: { box.currentOffset = $0 })

    let view = SourceView(document: .constant(document), source: sourceBinding, pendingOffset: pendingOffsetBinding, currentOffset: currentOffsetBinding)
    let hostingView = NSHostingView(rootView: view)
    hostingView.frame = NSRect(x: 0, y: 0, width: 400, height: 300)

    let window = NSWindow(
        contentRect: hostingView.frame,
        styleMask: [.titled],
        backing: .buffered,
        defer: false
    )
    window.animationBehavior = .none
    window.contentView = hostingView
    window.makeKeyAndOrderFront(nil)
    return HostedSourceView(window: window, hostingView: hostingView)
}

/// Deliberately leaks the window (never orders out or closes it) -- see this file's
/// header comment for why: this test bundle runs hosted inside the real MarkupEditor.app,
/// whose AppDelegate quits the app when the last window closes, and no test-host handler
/// ever replies to the resulting termination request.
@MainActor
private func teardown(_ harness: HostedSourceView) {
    _ = harness
}

@MainActor
private func pumpRunLoop(seconds: TimeInterval = 0.05) async {
    try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
}

@MainActor
@Suite(.serialized) struct SourceViewDirtyFlagTests {

    @Test func appearingWithNoPendingOffsetDoesNotDirtyAnUnmodifiedDocument() async {
        let document = MarkupDocument()
        #expect(document.hasChanges == false)
        let box = SourceBox(source: "Line one.\nLine two.\nLine three.")
        let harness = makeHostedSourceView(document: document, box: box)
        defer { teardown(harness) }

        await pumpRunLoop()

        #expect(document.hasChanges == false, "merely appearing (re-highlighting unmodified source) must not dirty the document")
    }

    @Test func appearingWithAPendingOffsetDoesNotDirtyAnUnmodifiedDocumentAndConsumesTheOffset() async {
        let document = MarkupDocument()
        #expect(document.hasChanges == false)
        let box = SourceBox(source: "Line one.\nLine two.\nLine three.", pendingOffset: 5)
        let harness = makeHostedSourceView(document: document, box: box)
        defer { teardown(harness) }

        await pumpRunLoop()

        #expect(document.hasChanges == false, "applying a pending selection offset on an unmodified document must not dirty it")
        #expect(box.pendingOffset == nil, "pendingOffset must be consumed exactly once and cleared")
        // The outward capture path: applying pendingOffset sets `selection` internally,
        // which must flow out through `currentOffset` via .onChange(of: selection) --
        // this is what MarkupDocumentView reads to capture the cursor position when the
        // user later toggles away from source.
        #expect(box.currentOffset == 5, "currentOffset must reflect the applied pending offset")
    }

    // applyPendingOffsetIfNeeded() previously published `currentOffset` only INDIRECTLY,
    // by setting `selection` and relying on `.onChange(of: selection)` to fire.
    // AttributedTextSelection's `==` is opaque, so whether
    // `AttributedTextSelection(insertionPoint: text.startIndex)` (what pendingOffset == 0
    // produces) compares equal to the initial `AttributedTextSelection()` default -- and
    // so never fires onChange -- can't be relied on. If it doesn't fire, currentOffset
    // silently keeps whatever a PREVIOUS SourceView instance last wrote, for offset 0
    // specifically. Fixed by setting `currentOffset` explicitly in
    // applyPendingOffsetIfNeeded rather than depending on the cascade.
    @Test func appearingWithPendingOffsetZeroSetsCurrentOffsetToZero() async {
        let document = MarkupDocument()
        let box = SourceBox(source: "Line one.\nLine two.\nLine three.", pendingOffset: 0)
        let harness = makeHostedSourceView(document: document, box: box)
        defer { teardown(harness) }

        await pumpRunLoop()

        #expect(box.pendingOffset == nil, "pendingOffset must be consumed exactly once and cleared")
        #expect(box.currentOffset == 0, "currentOffset must reflect the applied pending offset, even when it is 0")
    }

    // Two-instance variant of the test above: a prior NON-ZERO currentOffset must not
    // survive into a fresh instance that receives pendingOffset == 0 -- the exact
    // scenario the opaque-Equatable risk would have broken silently.
    @Test func priorNonZeroCurrentOffsetDoesNotSurviveIntoAFreshInstanceGettingOffsetZero() async {
        let document = MarkupDocument()
        let box = SourceBox(source: "Line one.\nLine two.\nLine three.", pendingOffset: 5)
        let firstHarness = makeHostedSourceView(document: document, box: box)
        defer { teardown(firstHarness) }
        await pumpRunLoop()
        #expect(box.currentOffset == 5, "sanity check: first appearance sets currentOffset to the non-zero pending value")

        box.pendingOffset = 0
        let secondHarness = makeHostedSourceView(document: document, box: box)
        defer { teardown(secondHarness) }
        await pumpRunLoop()

        #expect(box.currentOffset == 0, "a fresh appearance with pendingOffset 0 must overwrite the prior non-zero value, not leave it in place")
    }

    // applyPendingOffsetIfNeeded() previously only touched `currentOffset` on the path
    // where `pendingOffset != nil`. But `pendingOffset` can be nil for reasons other than
    // an HTML document (restore intentionally skipped) -- e.g. getSelectionBlockIndex()/
    // offsetForBlockIndex() returning nil at toggle time (no active webview, a JS-eval
    // error). In that case a fresh SourceView instance appeared WITHOUT touching
    // `currentOffset` at all, so MarkupDocumentView's `sourceCursorOffset` (the box here
    // stands in for it) would retain whatever a PREVIOUS, unrelated SourceView instance
    // last set -- a stale value that looks legitimate (non-nil) instead of honestly "no
    // info yet." Reproduced here by reusing the SAME box across TWO separate hosted
    // SourceView instances, mirroring how SourceView is recreated fresh on every toggle
    // while MarkupDocumentView's own @State persists across that recreation.
    @Test func reappearingWithoutAPendingOffsetResetsCurrentOffsetRatherThanLeakingAPreviousValue() async {
        let document = MarkupDocument()
        let box = SourceBox(source: "Line one.\nLine two.\nLine three.", pendingOffset: 5)
        let firstHarness = makeHostedSourceView(document: document, box: box)
        defer { teardown(firstHarness) }
        await pumpRunLoop()
        #expect(box.currentOffset == 5, "sanity check: first appearance with a pending offset sets currentOffset")
        #expect(box.pendingOffset == nil)

        // box.pendingOffset is already nil here (consumed above) -- exactly the state a
        // second SourceView instance would see if getSelectionBlockIndex()/
        // offsetForBlockIndex() returned nil at the NEXT toggle (no real restore target).
        let secondHarness = makeHostedSourceView(document: document, box: box)
        defer { teardown(secondHarness) }
        await pumpRunLoop()

        #expect(box.currentOffset == nil, "a fresh appearance with no pending offset must reset currentOffset, not leak the previous instance's value")
    }

    // No hosted "real edit" positive-control test here: a genuine user edit changes
    // `attributedSource` DIRECTLY via TextEditor's own two-way binding (AppKit-level
    // keystroke handling), and `attributedSource` is private @State -- unreachable from a
    // test without simulating real keyboard/focus interaction, which is unreliable in
    // this headless xctest host (window.isKeyWindow and firstResponder never become the
    // hosted NSTextView here, even after explicit activation).
    //
    // Mutating `box.source` externally to simulate "an edit" is a different code path (a
    // document reload/programmatic replacement, not a keystroke): `source`'s own
    // .onChange -> highlight -> attributedSource cascade always sees `source` already
    // equal to the reassigned content by the time isGenuineEdit's comparison runs, for
    // any externally-driven `source` change, so it correctly never dirties the document
    // either -- loading different content isn't a user edit. isGenuineEdit's own pure
    // tests above (SourceViewIsGenuineEditTests) are the real falsifier: they prove the
    // guard's decision function returns true for genuinely differing content, so
    // "appearing doesn't dirty" isn't trivially true because nothing can ever dirty.
}
