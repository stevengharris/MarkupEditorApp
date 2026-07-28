//
//  PluginSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

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
    
    private enum PluginType: String {
        case CodeView = "Code View"
        case Exporter
        case None = ""
    }

    var body: some View {
        Spacer()
        Form {
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
                        .disabled(!ExporterManager.shared.exists(focusedPlugin))
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
                        .disabled(!CodeViewManager.shared.exists(focusedPlugin))
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
    }
    
    private func focusedPluginType() -> PluginType {
        if CodeViewManager.shared.exists(focusedPlugin) {
            return .CodeView
        } else if ExporterManager.shared.exists(focusedPlugin) {
            return .Exporter
        } else {
            return .None
        }
    }

    private func addPlugin() async {
        if addPluginType == .CodeView {
            CodeViewManager.shared.add(name: newPluginName, url: newPluginURL)
        } else if addPluginType == .Exporter {
            ExporterManager.shared.add(name: newPluginName, url: newPluginURL)
        }
        addPluginType = .None
        newPluginURL = nil
    }

    private func deletePlugin() {
        guard let focusedPlugin else { return }
        if focusedPluginType() == .CodeView {
            CodeViewManager.shared.delete(focusedPlugin)
        } else if focusedPluginType() == .Exporter {
            ExporterManager.shared.delete(focusedPlugin)
        }
    }

}

#Preview {
    PluginSettingsView()
}
