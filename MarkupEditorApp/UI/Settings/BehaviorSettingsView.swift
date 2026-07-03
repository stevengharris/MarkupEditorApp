//
//  BehaviorSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

/// The BehaviorSettingsView addresses the behavior of the MarkupEditorApp, not the MarkupEditor.
/// As such, it operates against the appconfig.json and stores overrides in UserDefaults. The
/// behaviorConfig.json is really for the MarkupEditorApp developer, not for MarkupEditorApp users.
struct BehaviorSettingsView: View {
    
    typealias ConfigKey = AppConfig.ConfigKey
    typealias ToolbarVisibility = AppConfig.ToolbarVisibility
    typealias ToggledState = AppConfig.ToggledState
    
    @AppStorage(ConfigKey.app) private var appConfigJSON: String = ""
    @AppStorage(ConfigKey.toolbar) private var toolbarConfigJSON: String = ""
    @State private var appConfig: AppConfig = AppConfig.fromDefaults()
    @State private var toolbarConfig: ToolbarConfig = ToolbarConfig.fromDefaults()
    @State private var loaded = false
    @State private var toolbarVisibility: ToolbarVisibility

    var body: some View {
        Spacer()
        Form {
            Picker("Toolbar Visibility:", selection: $toolbarVisibility) {
                ForEach(ToolbarVisibility.allCases) { visibility in
                    Text(visibility.rawValue)
                }
            }
            .pickerStyle(.radioGroup)
            .onChange(of: toolbarVisibility) { oldValue, newValue in
                setToolbarVisibility(newValue)
            }
            LabeledContent("Installed Plugins:") {
                let plugins = appConfig.plugins ?? []
                if plugins.isEmpty {
                    Text("No plugins installed.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(plugins, id: \.name) { plugin in
                        Text(plugin.name)
                    }
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            toolbarConfig = ToolbarConfig.fromDefaults()
            toolbarVisibility = ToolbarVisibility(rawValue: appConfig.toolbarVisibility) ?? .toggled
        }
        .onChange(of: toolbarConfigJSON) {
            toolbarConfig = ToolbarConfig.fromJSON(toolbarConfigJSON)
        }
        Spacer()
    }
    
    init() {
        _toolbarVisibility = State(initialValue: ToolbarVisibility(rawValue: _appConfig.wrappedValue.toolbarVisibility) ?? .toggled)
    }
    
    /// Set the toolbarVisibility to the new value, keeping the config in proper sync and saving when done.
    /// By "proper sync", we mean that we have to track appConfig.toggledState to match the end state of whether
    /// the toolbar will be visible or not. And, the toolbarConfig.visibility has to be set properly because when we
    /// open a new MarkupEditorApp, the initial toolbar has to be set up properly to avoid a redraw.
    private func setToolbarVisibility(_ value: ToolbarVisibility) {
        appConfig.toolbarVisibility = value.rawValue
        if value == .hidden {           // When always hidden, toolbarConfig.visibility muse be false
            toolbarConfig.visibility["toolbar"] = false
            appConfig.toggledState = ToggledState.hidden.rawValue
        } else if value == .visible {   // When always visible, toolbarConfig.visibility must be true
            toolbarConfig.visibility["toolbar"] = true
            appConfig.toggledState = ToggledState.visible.rawValue
        } else {                        // When toggled, toolbarConfig.visibility depends on the current state
            toolbarConfig.visibility["toolbar"] = !appConfig.isHidden()
        }
        save()
    }
    
    private func save() {
        if let json = toolbarConfig.asJSON(), toolbarConfigJSON != json {
            toolbarConfigJSON = json
        } else {
            assertionFailure("ToolbarConfig encoding failed unexpectedly")
        }
        if let json = appConfig.asJSON(), appConfigJSON != json {
            appConfigJSON = json
        } else {
            assertionFailure("AppConfig encoding failed unexpectedly")
        }
    }
}

#Preview {
    BehaviorSettingsView()
}
