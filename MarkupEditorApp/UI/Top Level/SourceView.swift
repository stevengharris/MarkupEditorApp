//
//  SourceView.swift
//  MarkupEditorApp
//
//  Created by Steven G. Harris on 5/23/26.
//

import SwiftUI
import MarkupEditor

/// Displays the raw source of the current document with syntax highlighting.
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
