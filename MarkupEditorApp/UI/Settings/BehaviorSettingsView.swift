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
    @FocusState private var focusedPlugin: Plugin?
    @State private var showAddPlugin: Bool = false
    @State private var showDeletePlugin: Bool = false
    @State private var showPluginNameDialog: Bool = false
    @State private var newPluginURL: URL?
    @State private var newPluginName: String = ""
    
    private enum PluginType: String {
        case Renderer
        case Exporter
        case None = ""
    }

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
            LabeledContent("Installed Exporters:") {
                let exporters = AppConfig.shared.exporters
                if exporters.isEmpty {
                    Text("No exporters installed.")
                        .foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading) {
                        ForEach(exporters, id: \.name) { exporter in
                            Text(exporter.name)
                                .focusable()
                                .focused($focusedPlugin, equals: exporter)
                        }
                    }
                }
            }
            LabeledContent("") {
                HStack {
                    Button(action: { showAddPlugin = true }, label: { Image(systemName: "plus.square") })
                    Button(action: { showDeletePlugin = true }, label: { Image(systemName: "minus.square") })
                        .disabled(!ExporterManager.shared.exists(focusedPlugin))
                    Text("Add or delete exporter")
                        .lineLimit(1)
                        .font(.subheadline)
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 8)
            LabeledContent("Installed Renderers:") {
                let renderers = AppConfig.shared.renderers
                if renderers.isEmpty {
                    Text("No renderers installed.")
                        .foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading) {
                        ForEach(renderers, id: \.name) { renderer in
                            Text(renderer.name)
                                .focusable()
                                .focused($focusedPlugin, equals: renderer)
                        }
                    }
                }
            }
            LabeledContent("") {
                HStack {
                    Button(action: { showAddPlugin = true }, label: { Image(systemName: "plus.square") })
                    Button(action: { showDeletePlugin = true }, label: { Image(systemName: "minus.square") })
                        .disabled(!RendererManager.shared.exists(focusedPlugin))
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
        }
        .onChange(of: toolbarConfigJSON) {
            toolbarConfig = ToolbarConfig.fromJSON(toolbarConfigJSON)
        }
        .fileImporter(isPresented: $showAddPlugin, allowedContentTypes: [.javaScript], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                // Must start the security scope synchronously here, in the fileImporter completion
                // handler, not later inside addRenderer. The copy itself doesn't happen until the
                // user confirms the name in the alert, so the access grant has to be held open across
                // that whole interaction — RendererManager.add(name:url:) stops it once the copy is done,
                // and the alert's Cancel button stops it if the user backs out instead.
                guard url.startAccessingSecurityScopedResource() else { return }
                newPluginURL = url
                showPluginNameDialog = true
            }
        }
        .confirmationDialog(
            "Delete \"\(focusedPlugin?.name ?? "")\"? The original source location for \"\(focusedPlugin?.name ?? "")\" will not be affected. You cannot undo this action.",
            isPresented: $showDeletePlugin,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                deletePlugin()
            }
            Button("Cancel", role: .cancel) {}
        }
        .alert("Add New \(focusedPluginType().rawValue)", isPresented: $showPluginNameDialog) {
            TextField("Name", text: $newPluginName)
            Button("OK") {
                Task { await addPlugin() }
            }
            Button("Cancel", role: .cancel) {
                newPluginURL?.stopAccessingSecurityScopedResource()
                newPluginURL = nil
            }
        } message: {
            Text("Enter a name.")
        }
        Spacer()
    }
    
    private func focusedPluginType() -> PluginType {
        if RendererManager.shared.exists(focusedPlugin) {
            return .Renderer
        } else if ExporterManager.shared.exists(focusedPlugin) {
            return .Exporter
        } else {
            return .None
        }
    }

    private func addPlugin() async {
        if focusedPluginType() == .Renderer {
            RendererManager.shared.add(name: newPluginName, url: newPluginURL)
        } else if focusedPluginType() == .Exporter {
            ExporterManager.shared.add(name: newPluginName, url: newPluginURL)
        }
        newPluginURL = nil
    }

    private func deletePlugin() {
        if focusedPluginType() == .Renderer {
            RendererManager.shared.delete(focusedPlugin)
        } else if focusedPluginType() == .Exporter {
            ExporterManager.shared.delete(focusedPlugin)
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
    BehaviorSettingsView()
}
