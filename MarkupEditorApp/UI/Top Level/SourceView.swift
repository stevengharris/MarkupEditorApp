//
//  SourceView.swift
//  MarkupEditorApp
//
//  Created by Steven G. Harris on 5/23/26.
//

import SwiftUI
import MarkupEditor

/// Displays the raw source of the current document.
struct SourceView: View {

    @Binding var document: MarkupDocument
    @Binding var currentSource: String

    var body: some View {
        //let _ = Self._printChanges()
        VStack(spacing: 0) {
            SourceToolbarView(document: $document)
            Divider()
            TextEditor(text: $currentSource)
                .frame(maxWidth: .infinity, alignment: .leading)
                .font(.body)
                .monospaced()
                .padding(8)
        }
    }
    
}
