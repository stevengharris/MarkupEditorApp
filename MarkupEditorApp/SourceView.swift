//
//  SourceView.swift
//  MarkupEditorApp
//
//  Created by Steven G. Harris on 5/23/26.
//

import SwiftUI
import MarkupEditor

/// Displays the raw source of the current document.
///
/// `docType` drives the header label: `.md` shows "Markdown Document"; all other
/// types (including `nil`) show "HTML Document".
///
/// `sourceViewIsStale` is wired as a `@Binding` so the parent can signal that the
/// displayed content may be out of date (set to `true` by `markupInput`). A Refresh
/// button is always present in the header; it is enabled only when `sourceViewIsStale`
/// is `true` and `MarkupEditor.selectedWebView` is non-nil. The `onRefresh` closure
/// is called when the user taps the button; the closure is provided by the parent so
/// `SourceView` remains side-effect-free.
struct SourceView: View {

    @Binding var currentHtml: String
    @Binding var sourceViewIsStale: Bool
    var docType: DocumentType?
    var onRefresh: () -> Void = {}

    /// Derives the header label from the document type.
    /// `internal` (not `private`) so tests can verify it directly via @testable import.
    var headerText: String {
        docType == .md ? "Markdown Document" : "HTML Document"
    }

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            ZStack {
                Text(headerText)
                    .frame(maxWidth: .infinity)
                HStack {
                    Spacer()
                    Button("Refresh", systemImage: "arrow.clockwise", action: onRefresh)
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                        .padding(.trailing, 8)
                        .disabled(!sourceViewIsStale || MarkupEditor.selectedWebView == nil)
                }
            }
            .background(
                Color(nsColor: NSColor.unemphasizedSelectedContentBackgroundColor)
            )
            ScrollView {
                Text(currentHtml)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .font(Font.system(size: StyleContext.P.fontSize))
                    .padding([.top, .bottom, .leading, .trailing], 8)
            }
        }
    }
}
