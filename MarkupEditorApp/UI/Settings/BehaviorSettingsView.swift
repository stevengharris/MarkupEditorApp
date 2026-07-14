//
//  BehaviorSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

internal import UniformTypeIdentifiers

/// The BehaviorSettingsView addresses the behavior of the MarkupEditorApp, not the MarkupEditor.
/// As such, it operates against the appconfig.json and stores overrides in UserDefaults. The
/// behaviorConfig.json is really for the MarkupEditorApp developer, not for MarkupEditorApp users.
struct BehaviorSettingsView: View {
    
    typealias ConfigKey = AppConfig.ConfigKey
    typealias ToolbarVisibility = AppConfig.ToolbarVisibility
    typealias ToggledState = AppConfig.ToggledState
    
    @AppStorage(ConfigKey.toolbar) private var toolbarConfigJSON: String = ""
    @State private var toolbarConfig: ToolbarConfig = ToolbarConfig.fromDefaults()
    @State private var loaded = false
    @State private var toolbarVisibility: ToolbarVisibility = ToolbarVisibility(rawValue: AppConfig.shared.toolbarVisibility) ?? .toggled
    @State private var renderers: [RendererConfigEntry] = AppConfig.shared.renderers ?? []
    @FocusState private var focusedRenderer: String?
    @State private var showAddRenderer: Bool = false
    @State private var showDeleteRenderer: Bool = false

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
            .padding(.bottom, 8)
            LabeledContent("Installed Plugins:") {
                let plugins = AppConfig.shared.plugins ?? []
                if plugins.isEmpty {
                    Text("No plugins installed.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(plugins, id: \.name) { plugin in
                        Text(plugin.name)
                    }
                }
            }
            .padding(.bottom, 8)
            LabeledContent("Installed Renderers:") {
                if renderers.isEmpty {
                    Text("No renderers installed.")
                        .foregroundStyle(.secondary)
                } else {
                    ForEach(renderers, id: \.name) { renderer in
                        Text(renderer.name)
                            .focusable()
                            .focused($focusedRenderer, equals: renderer.name)
                    }
                }
            }
            LabeledContent("") {}
            LabeledContent("") {
                HStack {
                    Button(action: { showAddRenderer = true }, label: { Image(systemName: "plus.square") })
                    Button(action: { showDeleteRenderer = true }, label: { Image(systemName: "minus.square") })
                        .disabled(focusedRenderer == nil)
                    Text("Add or delete renderer")
                        .lineLimit(1)
                        .font(.subheadline)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 8)
            Spacer()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear {
            guard !loaded else { return }
            loaded = true
            toolbarConfig = ToolbarConfig.fromDefaults()
            toolbarVisibility = ToolbarVisibility(rawValue: AppConfig.shared.toolbarVisibility) ?? .toggled
            renderers = AppConfig.shared.renderers ?? []
        }
        .onChange(of: toolbarConfigJSON) {
            toolbarConfig = ToolbarConfig.fromJSON(toolbarConfigJSON)
        }
        .fileImporter(isPresented: $showAddRenderer, allowedContentTypes: [.javaScript], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                Task { await addRenderer(url) }
            }
        }
        .confirmationDialog(
            "Delete \"\(focusedRenderer ?? "")\"?",
            isPresented: $showDeleteRenderer,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                deleteRenderer()
            }
            Button("Cancel", role: .cancel) {}
        }
        Spacer()
    }
    
    private func addRenderer(_ url: URL) async {}
    private func deleteRenderer() {}

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
        }
        saveToolbarConfig()
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
    BehaviorSettingsView()
}
