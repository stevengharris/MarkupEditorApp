//
//  SourceView.swift
//  MarkupEditorApp
//
//  Created by Steven G. Harris on 5/23/26.
//

import SwiftUI
import MarkupEditor

/// Displays the raw source of the current document with syntax highlighting.
///
/// The `currentSource` is held in the MarkupDocumentView and tracks changes in the
/// source while typing. The document's source is updated from `currentSource` when
/// toggling back to the document view or when saving. Changes to `currentSource`
/// while typing set the `document.hasChanged` state, so we know whether the
/// `document` is out of sync with what is on the screen. This is similar to how the
///  `hasChanges` state is set to true when typing in the MarkupDocumentView via
///  the MarkupDelegate callback.
struct SourceView: View {

    @Binding var document: MarkupDocument
    @Binding var source: String
    /// A character offset (UTF-16 code units -- see `attributedIndex(in:forUTF16Offset:)`)
    /// at which to place the cursor once `attributedSource` is (re)built, e.g. after
    /// toggling from the document view with a remembered position. Applied once in
    /// `.onAppear` and cleared immediately after, so a later re-appearance without a
    /// fresh value doesn't reapply a stale offset.
    @Binding var pendingOffset: Int?
    /// The UTF-16 offset where the block starting at `pendingOffset` ends, so the whole
    /// block can be scrolled into view. `nil` shows just the block's first line.
    @Binding var pendingEndOffset: Int?
    /// The current cursor position (UTF-16 code units, same convention as `pendingOffset`),
    /// kept live via `.onChange(of: selection)` so MarkupDocumentView can read "where the
    /// cursor is" when toggling away from source, without needing its own copy of
    /// `selection`/`attributedSource`. Exposed as an `Int` rather than an
    /// `AttributedString.Index`, which is scoped to the specific `AttributedString`
    /// instance it came from and unsafe to pass across this boundary. `nil` until the
    /// first selection change in this instance -- callers must treat `nil` as "no
    /// information," not as offset 0.
    @Binding var currentOffset: Int?
    @State private var attributedSource = AttributedString("")
    @State private var selection = AttributedTextSelection()
    /// Drives keyboard focus onto the TextEditor. Setting `selection` (in
    /// `applyPendingOffsetIfNeeded`, below) updates `@State` correctly, but without the
    /// TextEditor being first responder, AppKit has no reason to visually move the caret
    /// there -- the selection is correct in state but invisible. Same requirement as
    /// `MarkupWKWebView.becomeFirstResponderIfReady` on the WKWebView side.
    @FocusState private var isTextEditorFocused: Bool
    /// The window hosting this view, found from the view itself so the reveal never depends
    /// on which window happens to be key.
    @State private var windowBox = HostWindowBox()
    /// The pending scroll-to-block task, cancelled when a new one starts or the view goes away.
    @State private var revealTask: Task<Void, Never>?

    private var highlighter: SyntaxHighlighter {
        SyntaxHighlighter(mode: document.isHTMLish ? .html : .markdown)
    }

    var body: some View {
        //let _ = Self._printChanges()
        VStack(spacing: 0) {
            SourceToolbarView(document: $document)
            Divider()
            TextEditor(text: $attributedSource, selection: $selection)
                .frame(maxWidth: .infinity, alignment: .leading)
                .font(.body)
                .monospaced()
                .padding(8)
                .focused($isTextEditorFocused)
                .onChange(of: attributedSource) { _, newAttributedSource in
                    guard Self.isGenuineEdit(newAttributedSource: newAttributedSource, currentSource: source) else { return }
                    source = String(newAttributedSource.characters)
                    document.hasChanges = true
                }
                .onChange(of: source) { _, newSource in
                    attributedSource = highlighter.highlight(newSource)
                }
                .onChange(of: selection) { _, newSelection in
                    currentOffset = Self.utf16Offset(of: newSelection, in: attributedSource)
                }
        }
        .background(HostWindowReader(box: windowBox))
        .onDisappear { revealTask?.cancel() }
        .onAppear {
            // pendingOffset must be applied against THIS assignment's resulting
            // AttributedString, not a stale one -- highlighter.highlight() returns a
            // fresh instance each call, and an AttributedString.Index from one instance
            // is not valid against another.
            attributedSource = highlighter.highlight(source)
            applyPendingOffsetIfNeeded()
            // Focus after the selection is set: unlike the WKWebView/ProseMirror side
            // (MarkupWKWebView.focus() -> setSelection(), which can reset the selection),
            // AppKit's TextEditor doesn't reset selection on focus, so this order is
            // simply "set state, then make it visible." Also makes the editor immediately
            // typable on every appearance, not just when restoring a specific offset.
            isTextEditorFocused = true
        }
    }

    /// Whether reassigning `attributedSource` to `newAttributedSource` represents a
    /// genuine text-content edit relative to `currentSource`, as opposed to a
    /// re-highlight/re-appear that leaves the underlying text unchanged.
    ///
    /// `attributedSource` is reassigned in `.onAppear` on every toggle to source
    /// (re-highlighting `source`, e.g. from `AttributedString("")` to a populated value
    /// the first time an instance appears), which IS a genuine `AttributedString` value
    /// change under `Equatable` comparison (attributes/highlighting runs are part of that
    /// comparison) -- but not a genuine EDIT unless the underlying plain-text content
    /// itself differs from what `source` currently holds. Comparing the derived plain
    /// text, not the `AttributedString` value, is what distinguishes the two: a real
    /// user edit changes `attributedSource` directly (via the TextEditor's own binding)
    /// BEFORE `source` catches up, so the comparison differs; every other path that
    /// reassigns `attributedSource` (re-highlight on appear, or the `.onChange(of:
    /// source)` cascade when `source` itself changes externally) does so only AFTER
    /// `source` already reflects the same content, so the comparison matches and no
    /// spurious dirty flag is set.
    ///
    /// Internal (not private) access for direct testability -- see
    /// SourceViewSelectionTests.swift.
    static func isGenuineEdit(newAttributedSource: AttributedString, currentSource: String) -> Bool {
        String(newAttributedSource.characters) != currentSource
    }

    private func applyPendingOffsetIfNeeded() {
        guard let offset = pendingOffset else {
            // No restore target for this appearance -- an HTML document (handleToggleSource
            // nils pendingSourceOffset for those), or getSelectionBlockIndex()/
            // offsetForBlockIndex() returning nil (no active webview, a JS-eval error).
            // currentOffset must reset here rather than keep whatever a PREVIOUS,
            // unrelated SourceView instance last wrote -- a stale non-nil value reads as a
            // legitimate current position, not the "no info" it actually is.
            currentOffset = nil
            return
        }
        let index = Self.attributedIndex(in: attributedSource, forUTF16Offset: offset)
        selection = AttributedTextSelection(insertionPoint: index)
        let endOffset = pendingEndOffset
        pendingEndOffset = nil
        revealBlock(from: offset, to: endOffset ?? offset)
        // Set explicitly rather than relying on .onChange(of: selection) to publish it:
        // AttributedTextSelection's == is opaque, so whether the assignment above compares
        // unequal to the prior value (e.g. whether offset 0's insertion-point selection
        // equals the initial AttributedTextSelection() default) can't be relied on. If it
        // ever compared equal, onChange wouldn't fire and currentOffset would keep a stale
        // value from a previous instance. The value is already in hand here, so publish it
        // directly instead of depending on that comparison.
        currentOffset = offset
        pendingOffset = nil // consumed exactly once
    }

    /// What to do to bring a block of text fully into view.
    enum BlockScroll: Equatable {
        case none, center, start
    }

    /// How to scroll so a block is fully visible: not at all when it is already inside the
    /// visible area with `margin` to spare, centered when it fits but is not, and
    /// top-aligned when it is taller than the visible area and cannot be shown whole.
    /// All values are vertical extents in the same coordinate space.
    static func blockScroll(blockTop: CGFloat, blockBottom: CGFloat, visibleTop: CGFloat, visibleBottom: CGFloat, margin: CGFloat = 16) -> BlockScroll {
        let available = visibleBottom - visibleTop - 2 * margin
        if blockBottom - blockTop > available {
            let atTop = blockTop >= visibleTop && blockTop <= visibleTop + 2 * margin
            return atTop ? .none : .start
        }
        let inside = blockTop >= visibleTop + margin && blockBottom <= visibleBottom - margin
        return inside ? .none : .center
    }

    /// The vertical scroll origin that performs `action`, kept within `0...maxOrigin`.
    static func scrollOriginY(for action: BlockScroll, blockTop: CGFloat, blockBottom: CGFloat, visibleHeight: CGFloat, maxOrigin: CGFloat, margin: CGFloat = 16) -> CGFloat? {
        let origin: CGFloat
        switch action {
        case .none: return nil
        case .center: origin = (blockTop + blockBottom) / 2 - visibleHeight / 2
        case .start: origin = blockTop - margin
        }
        return min(max(origin, 0), max(maxOrigin, 0))
    }

    /// Scrolls the source text so the block spanning `start..<end` (UTF-16 offsets) is fully
    /// visible. The TextEditor offers no scrolling API, so this reaches its NSTextView.
    /// Waits for the text view to hold the current text before scrolling.
    private func revealBlock(from start: Int, to end: Int) {
        revealTask?.cancel()
        let box = windowBox
        let expectedLength = String(attributedSource.characters).utf16.count
        revealTask = Task { @MainActor in
            guard let textView = await Self.textViewWhenReady(in: box, length: expectedLength),
                  let scrollView = textView.enclosingScrollView else { return }
            let length = (textView.string as NSString).length
            let lower = min(max(start, 0), length)
            let upper = min(max(end, lower + 1), length)
            // Text far from the visible area is laid out lazily, so its rectangle is only an estimate
            // until it has been scrolled to once. Let the text view bring the block on screen first,
            // then refine the position from real rectangles.
            textView.scrollRangeToVisible(NSRange(location: lower, length: upper - lower))
            try? await Task.sleep(for: .milliseconds(80))
            guard !Task.isCancelled else { return }
            let startRect = Self.textRect(in: textView, forCharacterAt: lower)
            let endRect = Self.textRect(in: textView, forCharacterAt: max(upper - 1, lower))
            guard let startRect, let endRect else { return }
            let bounds = scrollView.contentView.bounds
            let inset = scrollView.contentInsets
            let visibleTop = bounds.minY + inset.top
            let visibleBottom = bounds.maxY - inset.bottom
            let action = Self.blockScroll(blockTop: startRect.minY, blockBottom: endRect.maxY, visibleTop: visibleTop, visibleBottom: visibleBottom)
            let maxOrigin = textView.frame.height - bounds.height
            guard let y = Self.scrollOriginY(for: action, blockTop: startRect.minY, blockBottom: endRect.maxY, visibleHeight: visibleBottom - visibleTop, maxOrigin: maxOrigin + inset.top) else { return }
            scrollView.contentView.scroll(to: NSPoint(x: bounds.minX, y: max(y - inset.top, -inset.top)))
            scrollView.reflectScrolledClipView(scrollView.contentView)
        }
    }

    /// The text view in the hosting window once it holds `length` UTF-16 units of text, or nil
    /// if that does not happen within about two seconds or the task is cancelled.
    private static func textViewWhenReady(in box: HostWindowBox, length: Int) async -> NSTextView? {
        for _ in 0..<40 {
            if Task.isCancelled { return nil }
            if let textView = box.window?.contentView?.firstDescendant(ofType: NSTextView.self),
               (textView.string as NSString).length == length {
                return textView
            }
            try? await Task.sleep(for: .milliseconds(50))
        }
        return nil
    }

    /// The bounds, in `textView`'s coordinates, of the character at `offset` (UTF-16).
    private static func textRect(in textView: NSTextView, forCharacterAt offset: Int) -> CGRect? {
        let range = NSRange(location: offset, length: 0)
        let screen = textView.firstRect(forCharacterRange: range, actualRange: nil)
        guard !screen.isNull, let window = textView.window else { return nil }
        return textView.convert(window.convertFromScreen(screen), from: nil)
    }

    /// Converts `offset`, a **UTF-16 code unit offset** (matching
    /// markupeditor-app/src/blocks.js's blockIndexAtOffset/offsetForBlockIndex and the
    /// MarkupWKWebView bridge -- NOT a `Character`/grapheme-cluster count), into an
    /// `AttributedString.Index` within `text`, clamped to `text`'s bounds.
    ///
    /// `AttributedString`'s `.utf16` view (`AttributedString.UTF16View`, macOS 26+) has
    /// `Index == AttributedString.Index`, so this operates entirely in the same UTF-16
    /// code unit space the offset arrived in. `.characters` (Character/grapheme-based)
    /// would silently produce the wrong index on text containing a surrogate-pair
    /// character (emoji, etc.).
    ///
    /// Internal (not private) access so this is directly testable via `@testable import`
    /// without needing a live hosted view -- see SourceViewSelectionTests.swift.
    static func attributedIndex(in text: AttributedString, forUTF16Offset offset: Int) -> AttributedString.Index {
        let utf16 = text.utf16
        let clamped = min(max(offset, 0), utf16.count)
        return utf16.index(utf16.startIndex, offsetBy: clamped)
    }

    /// Inverse of `attributedIndex(in:forUTF16Offset:)`: the UTF-16 code unit offset of
    /// `selection`'s position within `text`, or `nil` if it cannot be resolved at all
    /// (should not happen in practice -- `selection` and `text` are always the same
    /// SourceView instance's own state at the point this is called).
    ///
    /// For a non-collapsed selection (`AttributedTextSelection.Indices.ranges`), uses the
    /// start of the first range as a single-offset proxy -- block-index restoration only
    /// needs "roughly where the cursor was," not the full selected range.
    ///
    /// Internal (not private) access for direct testability -- see
    /// SourceViewSelectionTests.swift.
    static func utf16Offset(of selection: AttributedTextSelection, in text: AttributedString) -> Int? {
        switch selection.indices(in: text) {
        case .insertionPoint(let index):
            return text.utf16.distance(from: text.utf16.startIndex, to: index)
        case .ranges(let rangeSet):
            guard let first = rangeSet.ranges.first else { return nil }
            return text.utf16.distance(from: text.utf16.startIndex, to: first.lowerBound)
        }
    }

}

private extension NSView {
    /// The first view of type `T` in this view's subtree, depth first.
    func firstDescendant<T: NSView>(ofType type: T.Type) -> T? {
        for sub in subviews {
            if let match = sub as? T { return match }
            if let match = sub.firstDescendant(ofType: type) { return match }
        }
        return nil
    }
}

/// Holds the window a view is installed in, without keeping it alive.
final class HostWindowBox {
    weak var window: NSWindow?
}

/// Reports the hosting window of the view it is attached to as a background.
private struct HostWindowReader: NSViewRepresentable {
    let box: HostWindowBox

    func makeNSView(context: Context) -> NSView {
        let view = ProbeView()
        view.box = box
        return view
    }

    func updateNSView(_ nsView: NSView, context: Context) {
        box.window = nsView.window
    }

    private final class ProbeView: NSView {
        var box: HostWindowBox?

        override func viewDidMoveToWindow() {
            super.viewDidMoveToWindow()
            box?.window = window
        }
    }
}
