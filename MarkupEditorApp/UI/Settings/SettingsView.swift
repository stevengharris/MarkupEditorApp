//
//  SettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI

struct SettingsView: View {

    enum Pane: String {
        case general, toolbar, keymap
    }

    /// UserDefaults key for the selected tab.
    static let selectedTabKey = "settingsTab"

    @Environment(\.dismiss) private var dismiss
    @AppStorage(Self.selectedTabKey) private var selection: Pane = .general

    var body: some View {
        TabView(selection: $selection) {
            Tab("General", systemImage: "gearshape.2", value: .general) {
                GeneralSettingsView()
            }
            Tab("Toolbar", systemImage: "rectangle.topthird.inset.filled", value: .toolbar) {
                ToolbarSettingsView()
            }
            Tab("Keymap", systemImage: "keyboard", value: .keymap) {
                KeymapSettingsView()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .dismissSettings)) { notification in
            dismiss()
        }
    }
}

#Preview {
    SettingsView()
}
