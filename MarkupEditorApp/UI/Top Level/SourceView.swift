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
