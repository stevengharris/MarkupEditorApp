//
//  PluginSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor
import MarkupEditorAppLib

internal import UniformTypeIdentifiers

struct PluginSettingsView: View {
    
    typealias ConfigKey = AppConfig.ConfigKey
    
    @State private var loaded = false
    @FocusState private var focusedPlugin: Plugin?
    @State private var addPluginType: PluginType = .None
    @State private var showAddPlugin: Bool = false
    @State private var showDeletePlugin: Bool = false
    @State private var showPluginNameDialog: Bool = false
    @State private var newPluginURL: URL?
    @State private var newPluginName: String = ""
    @State private var newPluginExt: String = ""
    @FocusState private var newPluginFocusedField: FocusedField?
    @Environment(\.openWindow) private var openWindow
    
    private enum FocusedField {
        case name
        case ext
    }

    private enum PluginType: String {
        case CodeView = "Code View"
        case Exporter
        case None = ""
    }

    var body: some View {
        Spacer()
        Form {
            // Entry point into the plugin discovery/browse window. Does not yet
            // replace the fileImporter-based add flow below.
            LabeledContent("") {
                Button("Browse Plugin Catalog…") { openWindow(id: "plugin-gallery") }
            }
            LabeledContent("Exporters:") {
                let exporters = AppConfig.shared.exporters
                if exporters.isEmpty {
                    Text("None")
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
                    Button(action: {
                        addPluginType = .Exporter
                        showAddPlugin = true
                    }, label: { Image(systemName: "plus.square") })
                    Button(action: { showDeletePlugin = true }, label: { Image(systemName: "minus.square") })
                        .disabled(!ExporterManager.exists(focusedPlugin, in: AppConfig.shared.exporters))
                    Text("Add or delete exporter")
                        .lineLimit(1)
                        .font(.subheadline)
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 8)
            LabeledContent("Code Views:") {
                let codeViews = AppConfig.shared.codeViews
                if codeViews.isEmpty {
                    Text("None")
                        .foregroundStyle(.secondary)
                } else {
                    VStack(alignment: .leading) {
                        ForEach(codeViews, id: \.name) { codeView in
                            Text(codeView.name)
                                .focusable()
                                .focused($focusedPlugin, equals: codeView)
                        }
                    }
                }
            }
            LabeledContent("") {
                HStack {
                    Button(action: {
                        addPluginType = .CodeView
                        showAddPlugin = true
                    }, label: { Image(systemName: "plus.square") })
                    Button(action: { showDeletePlugin = true }, label: { Image(systemName: "minus.square") })
                        .disabled(!CodeViewManager.exists(focusedPlugin, in: AppConfig.shared.codeViews))
                    Text("Add or delete code view")
                        .lineLimit(1)
                        .font(.subheadline)
                }
                .buttonStyle(.plain)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .onAppear {
            guard !loaded else { return }
            loaded = true
        }
        .fileImporter(isPresented: $showAddPlugin, allowedContentTypes: [.javaScript], allowsMultipleSelection: false) { result in
            if case .success(let urls) = result, let url = urls.first {
                // Must start the security scope synchronously here, in the fileImporter completion
                // handler, not later inside addPlugin. The copy itself doesn't happen until the
                // user confirms the name in the alert, so the access grant has to be held open across
                // that whole interaction — CodeViewManager.add(name:url:) stops it once the copy is done,
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
        .alert("Add New \(addPluginType.rawValue)", isPresented: $showPluginNameDialog) {
            TextField(text: $newPluginName, prompt: Text("Identify the \(addPluginType.rawValue.lowercased())")) {
                Text("Name")
            }
            .focused($newPluginFocusedField, equals: .name)
            .onSubmit {
                Task {
                    if addPluginType == .CodeView {
                        await addPlugin()
                    } else {
                        newPluginFocusedField = .ext
                    }
                }
            }
            if addPluginType == .CodeView {
                Button("OK") {
                    Task { await addPlugin() }
                }
                .disabled(newPluginName.isEmpty)
            } else {
                TextField(text: $newPluginExt, prompt: Text("Default export file extension")) {
                    Text("Extension")
                }
                .focused($newPluginFocusedField, equals: .ext)
                .onSubmit {
                    Task { await addPlugin() }
                }
                Button("OK") {
                    Task { await addPlugin() }
                }
                .disabled(newPluginName.isEmpty || newPluginExt.isEmpty)
                Button("Cancel", role: .cancel) {
                    newPluginURL?.stopAccessingSecurityScopedResource()
                    newPluginURL = nil
                }
            }
        }
    }
    
    private func focusedPluginType() -> PluginType {
        if CodeViewManager.exists(focusedPlugin, in: AppConfig.shared.codeViews) {
            return .CodeView
        } else if ExporterManager.exists(focusedPlugin, in: AppConfig.shared.exporters) {
            return .Exporter
        } else {
            return .None
        }
    }

    private func addPlugin() async {
        if addPluginType == .CodeView {
            AppConfig.update { config in
                config.codeViews = CodeViewManager.add(name: newPluginName, url: newPluginURL, exporters: config.exporters, codeViews: config.codeViews, cacheDir: AppDelegate.webViewCacheDir)
                addPluginType = .None
                newPluginFocusedField = .name
                newPluginURL = nil
            }
        } else if addPluginType == .Exporter {
            AppConfig.update { config in
                config.exporters = ExporterManager.add(name: newPluginName, url: newPluginURL, ext: newPluginExt, exporters: config.exporters, codeViews: config.codeViews, cacheDir: AppDelegate.webViewCacheDir)
                addPluginType = .None
                newPluginFocusedField = .name
                newPluginURL = nil
            }
        }
    }

    private func deletePlugin() {
        guard let focusedPlugin else { return }
        if focusedPluginType() == .CodeView {
            AppConfig.update { config in
                config.codeViews = CodeViewManager.delete(focusedPlugin, codeViews: config.codeViews, cacheDir: AppDelegate.webViewCacheDir)
            }
        } else if focusedPluginType() == .Exporter {
            AppConfig.update { config in
                config.exporters = ExporterManager.delete(focusedPlugin, exporters: config.exporters, cacheDir: AppDelegate.webViewCacheDir)
            }
        }
    }

}

#Preview {
    PluginSettingsView()
}
