//
//  SourceView.swift
//  MarkupEditorApp
//
//  Created by Steven G. Harris on 5/23/26.
//

import SwiftUI
import MarkupEditor

/// Displays the raw HTML source of the current document.
///
/// `sourceViewIsStale` is wired as a `@Binding` so the parent can signal that the
/// displayed content may be out of date (set to `true` by `markupInput`). Refresh
/// button visibility and auto-refresh logic are deferred to P5b.
struct SourceView: View {

    @Binding var currentHtml: String
    @Binding var sourceViewIsStale: Bool
    var headerTitle: String = "HTML Document"

    var body: some View {
        VStack(spacing: 0) {
            Divider()
            HStack {
                Spacer()
                Text(headerTitle)
                Spacer()
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
