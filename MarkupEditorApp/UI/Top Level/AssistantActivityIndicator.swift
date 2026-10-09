//
//  AssistantActivityIndicator.swift
//  MarkupEditorApp
//

import SwiftUI

/// Shows in the toolbar while an assistant has used MarkupEditor in the last minute, so the user
/// can see when something other than them is working with the document.
struct AssistantActivityIndicator: View {

    private let control = AppControl.shared

    var body: some View {
        let name = control.recentClient ?? "An assistant"
        Image(systemName: "sparkles")
            .foregroundStyle(.tint)
            .help("\(name) is working with this document")
            .accessibilityLabel("\(name) is working with this document")
    }
}
