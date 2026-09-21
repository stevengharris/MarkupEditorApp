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
    @State private var addDialog: AddDialog?
    @State private var showAddDialog = false
    @Environment(\.openWindow) private var openWindow

    /// A plugin file whose banner has been read and checked, waiting for the user's confirmation.
    private struct PendingPlugin {
        let url: URL
        let banner: PluginBanner
    }

    private enum AddDialog {
        case confirm(PendingPlugin)
        case failure(String)
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
                // Internal plugins (currently just Metadata) are pre-installed but
                // never user-visible here -- they have no user-facing update/delete story.
                let codeViews = AppConfig.shared.codeViews.filter { !CodeViewManager.protectedNames.contains($0.name) }
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
                        .disabled(
                            !CodeViewManager.exists(focusedPlugin, in: AppConfig.shared.codeViews)
                            || CodeViewManager.protectedNames.contains(focusedPlugin?.name ?? "")
                        )
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
            guard case .success(let urls) = result, let url = urls.first else {
                if case .failure(let error) = result, (error as? CocoaError)?.code != .userCancelled {
                    present(.failure(error.localizedDescription))
                }
                addPluginType = .None
                return
            }
            // Must start the security scope synchronously here, in the fileImporter completion
            // handler. The copy itself doesn't happen until the user confirms in the alert, so the
            // access grant has to be held open across that whole interaction -- the managers' add
            // stops it once the copy is done, and the alert's Cancel button (or a failed check)
            // stops it if the user backs out instead.
            guard url.startAccessingSecurityScopedResource() else {
                present(.failure("MarkupEditor was not given access to that file."))
                addPluginType = .None
                return
            }
            prepareToAdd(url)
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
        .alert(addDialogTitle, isPresented: $showAddDialog, presenting: addDialog) { dialog in
            switch dialog {
            case .confirm(let pending):
                Button("Add") { addPlugin(pending) }
                Button("Cancel", role: .cancel) { cancelAdd(pending) }
            case .failure:
                Button("OK", role: .cancel) {}
            }
        } message: { dialog in
            Text(addDialogMessage(dialog))
        }
    }

    private var addDialogTitle: String {
        switch addDialog {
        case .confirm(let pending): "Add \(pending.banner.kind.displayName.capitalized)?"
        case .failure: "Could Not Add Plugin"
        case nil: ""
        }
    }

    private func present(_ dialog: AddDialog) {
        addDialog = dialog
        showAddDialog = true
    }

    private func addDialogMessage(_ dialog: AddDialog) -> String {
        switch dialog {
        case .confirm(let pending):
            let banner = pending.banner
            let extra = banner.ext.map { " (.\($0))" } ?? ""
            return "Add the \(banner.kind.displayName) “\(banner.name)”\(extra)?"
        case .failure(let message):
            return message
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

    /// Reads and checks the banner of the picked file. The name and extension come from the
    /// plugin itself, so there is nothing for the user to type.
    private func prepareToAdd(_ url: URL) {
        let expected: PluginBanner.Kind = addPluginType == .Exporter ? .exporter : .codeview
        do {
            let banner = try PluginBanner.read(from: url)
            try PluginAddCheck.validate(banner, filename: url.lastPathComponent, expected: expected, exporters: AppConfig.shared.exporters, codeViews: AppConfig.shared.codeViews)
            present(.confirm(PendingPlugin(url: url, banner: banner)))
        } catch {
            url.stopAccessingSecurityScopedResource()
            present(.failure(error.localizedDescription))
            addPluginType = .None
        }
    }

    private func cancelAdd(_ pending: PendingPlugin) {
        pending.url.stopAccessingSecurityScopedResource()
        addPluginType = .None
    }

    private func addPlugin(_ pending: PendingPlugin) {
        let banner = pending.banner
        var failure: String?
        AppConfig.update { config in
            do {
                switch banner.kind {
                case .codeview:
                    config.codeViews = try CodeViewManager.install(name: banner.name, url: pending.url, exporters: config.exporters, codeViews: config.codeViews, cacheDir: AppDelegate.webViewCacheDir)
                case .exporter:
                    guard let ext = banner.ext else {
                        failure = "The exporter “\(banner.name)” declares no file extension."
                        return
                    }
                    config.exporters = try ExporterManager.install(name: banner.name, url: pending.url, ext: ext, exporters: config.exporters, codeViews: config.codeViews, cacheDir: AppDelegate.webViewCacheDir)
                }
                config.pluginsRevision += 1
            } catch {
                failure = error.localizedDescription
            }
        }
        addPluginType = .None
        if let failure {
            // Presented after this alert has finished dismissing, which would clear it.
            Task { present(.failure(failure)) }
        }
    }

    private func deletePlugin() {
        guard let focusedPlugin else { return }
        if focusedPluginType() == .CodeView {
            AppConfig.update { config in
                config.codeViews = CodeViewManager.delete(focusedPlugin, codeViews: config.codeViews, cacheDir: AppDelegate.webViewCacheDir)
                config.pluginsRevision += 1
            }
        } else if focusedPluginType() == .Exporter {
            AppConfig.update { config in
                config.exporters = ExporterManager.delete(focusedPlugin, exporters: config.exporters, cacheDir: AppDelegate.webViewCacheDir)
                config.pluginsRevision += 1
            }
        }
    }

}

#Preview {
    PluginSettingsView()
}
