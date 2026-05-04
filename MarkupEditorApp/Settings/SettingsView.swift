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
            ToolbarSettingsView()
                .tabItem { Label("Toolbar", systemImage: "rectangle.topthird.inset.filled") }
            KeymapSettingsView()
                .tabItem { Label("Keymap", systemImage: "keyboard") }
            BehaviorSettingsView()
                .tabItem { Label("Behavior", systemImage: "gearshape.2") }
        }
        .frame(width: 500, height: 400)
        .onReceive(NotificationCenter.default.publisher(for: .dismissSettings)) { notification in
            dismiss()
        }
    }
}
