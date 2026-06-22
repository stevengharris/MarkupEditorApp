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
/// `pluginLabel` drives the header label: a non-nil value produces "\(pluginLabel) Document"
/// (e.g. "Markdown Document"); nil falls back to "HTML Document".
///
/// `sourceViewIsStale` is wired as a `@Binding` so the parent can signal that the
/// displayed content may be out of date (set to `true` by `markupInput`). A Refresh
/// button is always present in the header; it is enabled only when `sourceViewIsStale`
/// is `true` and `MarkupEditor.selectedWebView` is non-nil. The `onRefresh` closure
/// is called when the user taps the button; the closure is provided by the parent so
/// `SourceView` remains side-effect-free.
struct SourceView: View {

    @Binding var currentSource: String
    @Binding var sourceViewIsStale: Bool
    var pluginLabel: String?
    var onRefresh: () -> Void = {}

    /// Derives the header label from the plugin name, or falls back to "HTML Document".
    /// `internal` (not `private`) so tests can verify it directly via @testable import.
    var headerText: String {
        pluginLabel.map { "\($0) Document" } ?? "HTML Document"
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
                Text(currentSource)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .font(Font.system(size: StyleContext.P.fontSize))
                    .padding([.top, .bottom, .leading, .trailing], 8)
                    .textSelection(.enabled)
            }
        }
    }
}
