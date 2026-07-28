//
//  SettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI

struct SettingsView: View {
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        TabView {
            Tab("General", systemImage: "gearshape.2") {
                GeneralSettingsView()
            }
            Tab("Toolbar", systemImage: "rectangle.topthird.inset.filled") {
                ToolbarSettingsView()
            }
            Tab("Keymap", systemImage: "keyboard") {
                KeymapSettingsView()
            }
            Tab("Plugins", systemImage: "powerplug") {
                PluginSettingsView()
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
