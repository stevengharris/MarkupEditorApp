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
    @State private var attributedSource = AttributedString("")

    private var highlighter: SyntaxHighlighter {
        SyntaxHighlighter(mode: document.isHTMLish ? .html : .markdown)
    }

    var body: some View {
        //let _ = Self._printChanges()
        VStack(spacing: 0) {
            SourceToolbarView(document: $document)
            Divider()
            TextEditor(text: $attributedSource)
                .frame(maxWidth: .infinity, alignment: .leading)
                .font(.body)
                .monospaced()
                .padding(8)
                .onChange(of: attributedSource) { _, newAttributedSource in
                    source = String(newAttributedSource.characters)
                    document.hasChanges = true
                }
                .onChange(of: source) { _, newSource in
                    attributedSource = highlighter.highlight(newSource)
                }
        }
        .onAppear {
            attributedSource = highlighter.highlight(source)
        }
    }

}
