//
//  SourceSelectionSpikeTests.swift
//  MarkupEditorAppTests
//
//  Proves the mechanism SourceView relies on for restoring a selection: placing an
//  AttributedTextSelection insertion point at a character offset, and confirming that
//  writing only the selection binding does not also mutate the text binding (which is
//  what SourceView.swift's .onChange(of: attributedSource) uses to set
//  document.hasChanges).
//
//  Does not modify SourceView.swift. A standalone harness view mirrors its exact
//  TextEditor(text:) + onChange(of:) pattern, independent of the real view.
//

import Testing
import SwiftUI
import AppKit
import Foundation

// MARK: - Offset -> AttributedString.Index (pure, no hosting needed)

/// Mirrors the construction the design calls for: characters.index(_:offsetBy:)
/// clamped to endIndex, derived from the SAME AttributedString instance the
/// selection will be applied to.
private func clampedIndex(in text: AttributedString, offset: Int) -> AttributedString.Index {
    let count = text.characters.count
    let clampedOffset = max(0, min(offset, count))
    return text.characters.index(text.startIndex, offsetBy: clampedOffset)
}

@MainActor
@Suite struct OffsetToInsertionPointTests {

    @Test func placesInsertionPointAtRequestedOffset() {
        let text = AttributedString("Hello, world! This is a test.")
        let offset = 7
        let idx = clampedIndex(in: text, offset: offset)
        let selection = AttributedTextSelection(insertionPoint: idx)

        guard case .insertionPoint(let resultIdx) = selection.indices(in: text) else {
            Issue.record("expected .insertionPoint, got .ranges")
            return
        }
        let resultOffset = text.characters.distance(from: text.startIndex, to: resultIdx)
        #expect(resultOffset == offset)
    }

    @Test func offsetAtStartProducesStartIndex() {
        let text = AttributedString("abc")
        let idx = clampedIndex(in: text, offset: 0)
        #expect(idx == text.startIndex)
    }

    @Test func outOfBoundsOffsetClampsToEndIndex() {
        let text = AttributedString("Hi")
        let idx = clampedIndex(in: text, offset: 100)
        #expect(idx == text.endIndex)
    }

    @Test func negativeOffsetClampsToStartIndex() {
        let text = AttributedString("Hi")
        let idx = clampedIndex(in: text, offset: -5)
        #expect(idx == text.startIndex)
    }

    @Test func offsetOnEmptyStringProducesStartIndex() {
        let text = AttributedString("")
        let idx = clampedIndex(in: text, offset: 3)
        #expect(idx == text.startIndex)
        #expect(idx == text.endIndex)
    }
}

// MARK: - Live-hosted TextEditor: does a selection-only write dirty the text?

/// Mirrors SourceView's TextEditor + onChange(of:) shape exactly, but with the text
/// and selection driven by externally-supplied bindings and a `dirtied` flag standing
/// in for `document.hasChanges`.
private struct SelectionSpikeHarness: View {
    @Binding var text: AttributedString
    @Binding var selection: AttributedTextSelection
    @Binding var dirtied: Bool

    var body: some View {
        TextEditor(text: $text, selection: $selection)
            .onChange(of: text) { _, _ in
                dirtied = true
            }
    }
}

/// Backing store for the harness's bindings. Must be `@Observable`, not a plain class:
/// a `Binding(get:set:)` closure that merely reads/writes a plain property gives
/// SwiftUI's view graph no way to detect a change made from outside a SwiftUI
/// transaction. `@Observable` registers the dependency when the Binding's `get` closure
/// reads the property during a tracked render, so an external `state.text = ...` write
/// correctly invalidates and re-renders.
@Observable
@MainActor
private final class SpikeState {
    var text: AttributedString
    var selection = AttributedTextSelection()
    var dirtied = false

    init(text: String) {
        self.text = AttributedString(text)
    }
}

@MainActor
private struct HostedHarness {
    let window: NSWindow
    let hostingView: NSHostingView<SelectionSpikeHarness>
}

@MainActor
private func makeHostedHarness(_ state: SpikeState) -> HostedHarness {
    let textBinding = Binding(get: { state.text }, set: { state.text = $0 })
    let selectionBinding = Binding(get: { state.selection }, set: { state.selection = $0 })
    let dirtiedBinding = Binding(get: { state.dirtied }, set: { state.dirtied = $0 })

    let harness = SelectionSpikeHarness(text: textBinding, selection: selectionBinding, dirtied: dirtiedBinding)
    let hostingView = NSHostingView(rootView: harness)
    hostingView.frame = NSRect(x: 0, y: 0, width: 400, height: 300)

    let window = NSWindow(
        contentRect: hostingView.frame,
        styleMask: [.titled],
        backing: .buffered,
        defer: false
    )
    // No .closable style and no close-animation: window.close() on a closable/titled
    // window can SIGSEGV (-[_NSWindowTransformAnimation dealloc], deep inside a later
    // CoreAnimation transaction flush -- window-close animation teardown racing later
    // test/run-loop activity in the same process). Teardown uses orderOut(nil) instead,
    // below.
    window.animationBehavior = .none
    window.contentView = hostingView
    window.makeKeyAndOrderFront(nil)
    return HostedHarness(window: window, hostingView: hostingView)
}

/// Deliberately does NOT hide or close the window: this test bundle runs hosted inside
/// the real MarkupEditor.app (see MarkupWKWebViewHeadlessTests.swift's header comment),
/// and AppDelegate.applicationShouldTerminateAfterLastWindowClosed(_:) returns `true` --
/// production behavior, not a test artifact (AppDelegate.swift ~line 54: "Quit the app
/// when the window is closed"). If a test's window is the app's LAST visible window,
/// AppKit's "last window closed" check fires for real, calling
/// AppDelegate.applicationShouldTerminate(_:) -- that posts .menuQuitApplication and
/// returns .terminateLater, expecting MarkupDocumentView's real notification handler to
/// eventually call NSApp.reply(toApplicationShouldTerminate:). No such handler exists in
/// this headless test host, so nothing ever replies, and the entire process hangs
/// forever inside AppKit's nested -[NSApplication _shouldTerminate] run loop. The
/// trigger is the window COUNT hitting zero, not scheduling overlap -- leave every
/// test's window open (leaked, harmless for a short-lived test process) so at least one
/// window always exists in this process.
@MainActor
private func teardown(_ harness: HostedHarness) {
    _ = harness // intentionally not ordered out or closed -- see comment above
}

/// Lets SwiftUI's view graph actually update -- hosted-view state changes don't take
/// effect synchronously on assignment. Uses Task.sleep, NOT RunLoop.main.run(until:).
///
/// RunLoop.main.run(until:) is a BLOCKING, NESTED recursion into the very run loop that
/// Swift Testing's own async test machinery, and every other concurrently-scheduled
/// test's MainActor work, depend on for scheduling. Calling it from inside an
/// already-running MainActor context (a @Test func's body) creates reentrancy that can
/// hang the process when another suite has async MainActor work pending concurrently.
/// Task.sleep suspends the current Task instead of recursing into the run loop, so the
/// real CFRunLoop (already spinning as part of NSApplicationMain) keeps servicing
/// pending SwiftUI transactions/timers on its own, undisturbed.
@MainActor
private func pumpRunLoop(seconds: TimeInterval = 0.05) async {
    try? await Task.sleep(nanoseconds: UInt64(seconds * 1_000_000_000))
}

// .serialized is cheap insurance against races between these tests' own real
// NSWindow/NSHostingView creation -- multiple tests creating live AppKit windows have
// no need to race each other.
@MainActor
@Suite(.serialized) struct HostedTextEditorSelectionTests {

    @Test func positiveControlDirectTextMutationDoesDirty() async {
        // Falsifier for the negative-control test below: if a REAL text mutation
        // doesn't set `dirtied`, the harness never went live and any "selection alone
        // doesn't dirty" result would be meaningless.
        let state = SpikeState(text: "Line one.\nLine two.\nLine three.")
        let harness = makeHostedHarness(state)
        defer { teardown(harness) }

        await pumpRunLoop()
        #expect(state.dirtied == false)

        state.text = AttributedString("Line one.\nLine two -- edited.\nLine three.")
        await pumpRunLoop()

        #expect(state.dirtied == true)
    }

    @Test func selectionOnlyWriteDoesNotDirty() async {
        let state = SpikeState(text: "Line one.\nLine two.\nLine three.")
        let harness = makeHostedHarness(state)
        defer { teardown(harness) }

        await pumpRunLoop()
        #expect(state.dirtied == false)

        let idx = clampedIndex(in: state.text, offset: 5)
        state.selection = AttributedTextSelection(insertionPoint: idx)
        await pumpRunLoop()

        #expect(state.dirtied == false)

        // Also confirm the selection actually took, against a live-hosted TextEditor
        // rather than a bare AttributedString/AttributedTextSelection pair.
        if case .insertionPoint(let resultIdx) = state.selection.indices(in: state.text) {
            let resultOffset = state.text.characters.distance(from: state.text.startIndex, to: resultIdx)
            #expect(resultOffset == 5)
        } else {
            Issue.record("expected .insertionPoint after programmatic selection write")
        }
    }

    @Test func windowKeyAndFirstResponderState() async {
        // Does merely ordering the window front make it key / make the TextEditor's
        // underlying NSTextView first responder, or is an explicit focus step required?
        // This is environment-dependent (an xctest host process is not guaranteed to be
        // the frontmost app even after makeKeyAndOrderFront), so this test only asserts
        // the hosting itself is real -- the actual isKeyWindow/firstResponder values
        // are printed rather than hard-asserted, since a false reading here would
        // reflect the test-runner environment, not SourceView's real runtime.
        let state = SpikeState(text: "abc")
        let harness = makeHostedHarness(state)
        defer { teardown(harness) }

        await pumpRunLoop()

        #expect(harness.hostingView.window === harness.window)
        print("[spike] window.isKeyWindow=\(harness.window.isKeyWindow) firstResponder=\(String(describing: harness.window.firstResponder))")

        NSApp.activate(ignoringOtherApps: true)
        harness.window.makeKeyAndOrderFront(nil)
        await pumpRunLoop()
        print("[spike] after explicit activate: window.isKeyWindow=\(harness.window.isKeyWindow) firstResponder=\(String(describing: harness.window.firstResponder))")
    }
}
