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
            Tab("Toolbar", systemImage: "rectangle.topthird.inset.filled") {
                ToolbarSettingsView()
            }
            Tab("Keymap", systemImage: "keyboard") {
                KeymapSettingsView()
            }
            Tab("Behavior", systemImage: "gearshape.2") {
                BehaviorSettingsView()
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
