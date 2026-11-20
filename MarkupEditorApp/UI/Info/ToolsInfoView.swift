//
//  ToolsInfoView.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// The Tools tab: collapsible sections in the style of the Plugins tab. Templates and Shortcuts.
struct ToolsInfoView: View {

    var body: some View {
        List {
            TemplatesInfoView()
            ShortcutsInfoView()
        }
        .listStyle(.plain)
        .padding(.horizontal, InfoSectionLayout.chevronInset)
    }
}
