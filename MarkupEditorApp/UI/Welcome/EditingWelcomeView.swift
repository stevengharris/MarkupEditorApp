//
//  EditingWelcomeView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 10/17/26.
//

import SwiftUI
import MarkupEditor

struct EditingWelcomeView: View {

    typealias ConfigKey = AppConfig.ConfigKey
    typealias ToolbarVisibility = AppConfig.ToolbarVisibility
    typealias ToggledState = AppConfig.ToggledState

    @AppStorage(ConfigKey.toolbar) private var toolbarConfigJSON: String = ""

    @State private var toolbarConfig: ToolbarConfig = ToolbarConfig.fromDefaults()
    @State private var toolbarVisibility: ToolbarVisibility = ToolbarVisibility(rawValue: AppConfig.shared.toolbarVisibility) ?? .toggled

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Change the editing defaults and appearance to fit your preferences. You can change them later using Settings.")
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.bottom, 12)
            Form {
                Picker("Toolbar:", selection: $toolbarVisibility) {
                    ForEach(ToolbarVisibility.allCases) { visibility in
                        Text(visibility.rawValue)
                    }
                }
                .pickerStyle(.radioGroup)
                .onChange(of: toolbarVisibility) { oldValue, newValue in
                    setToolbarVisibility(newValue)
                }
                .padding(.bottom, 6)
                EditingSettingsSection()
            }
            .padding(EdgeInsets(top: 12, leading: 20, bottom: 12, trailing: 20))
            .frame(maxWidth: .infinity)
            .background {
                RoundedRectangle(cornerRadius: 6)
                    .fill(Color.gray.opacity(0.1))
            }
        }
    }

    /// Set the toolbarVisibility to the new value, keeping the config in proper sync and saving when done.
    /// By "proper sync", we mean that we have to track AppConfig's toggledState to match the end state of whether
    /// the toolbar will be visible or not. And, the toolbarConfig.visibility has to be set properly because when we
    /// open a new MarkupEditorApp, the initial toolbar has to be set up properly to avoid a redraw.
    private func setToolbarVisibility(_ value: ToolbarVisibility) {
        AppConfig.update { config in
            config.toolbarVisibility = value.rawValue
            if value == .hidden {           // When always hidden, toolbarConfig.visibility muse be false
                toolbarConfig.visibility["toolbar"] = false
                config.toggledState = ToggledState.hidden.rawValue
            } else if value == .visible {   // When always visible, toolbarConfig.visibility must be true
                toolbarConfig.visibility["toolbar"] = true
                config.toggledState = ToggledState.visible.rawValue
            } else {                        // When toggled, toolbarConfig.visibility depends on the current state
                toolbarConfig.visibility["toolbar"] = !config.isHidden()
            }
            saveToolbarConfig()
        }
    }

    private func saveToolbarConfig() {
        if let json = toolbarConfig.asJSON(), toolbarConfigJSON != json {
            toolbarConfigJSON = json
        } else {
            assertionFailure("ToolbarConfig encoding failed unexpectedly")
        }
    }
}

#Preview {
    EditingWelcomeView()
}
