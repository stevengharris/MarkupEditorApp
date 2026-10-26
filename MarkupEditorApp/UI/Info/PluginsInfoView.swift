//
//  PluginsInfoView.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditor
import MarkupEditorAppLib

internal import UniformTypeIdentifiers

/// Lists the CodeViews and Exporters that are installed or available from the plugin catalog. A plugin
/// can be installed from the catalog, uninstalled, or added from a file with the + button in its header.
/// Installed plugins are listed even when the catalog cannot be loaded.
struct PluginsInfoView: View {

    /// The indentation a disclosure group gives its content, removed so rows line up under the heading.
    private static let disclosureIndent: CGFloat = 13

    /// How far the disclosure chevrons are moved right, clear of the splitter that overlaps the panel's left edge.
    private static let chevronInset: CGFloat = 8

    @Environment(EditLog.self) private var editLog
    @State private var model = PluginDiscoveryModel()
    @State private var codeViewsExpanded = true
    @State private var exportersExpanded = true
    @State private var addPluginType: PluginType?
    @State private var addDialog: AddDialog?
    @State private var showAddDialog = false
    @State private var uninstallRequest: UninstallRequest?
    @State private var showUninstall = false

    /// A plugin file whose banner has been read and checked, waiting for the user's confirmation.
    private struct PendingPlugin {
        let url: URL
        let banner: PluginBanner
    }

    private enum AddDialog {
        case confirm(PendingPlugin)
        case failure(String)
    }

    private struct UninstallRequest {
        let plugin: Plugin
        let type: PluginType
        /// Whether the plugin was added from a file, in which case it is reinstalled from a file.
        let fromFile: Bool
    }

    var body: some View {
        List {
            catalogStatus
            DisclosureGroup(isExpanded: $codeViewsExpanded) {
                rows(for: .codeview)
            } label: {
                header("CodeViews", type: .codeview, expanded: $codeViewsExpanded)
                    .padding(.leading, -Self.chevronInset)
            }
            DisclosureGroup(isExpanded: $exportersExpanded) {
                rows(for: .exporter)
            } label: {
                header("Exporters", type: .exporter, expanded: $exportersExpanded)
                    .padding(.leading, -Self.chevronInset)
            }
        }
        .listStyle(.plain)
        .padding(.leading, Self.chevronInset)
        .task { await model.load() }
        .confirmationDialog(
            "Uninstall \"\(uninstallRequest?.plugin.name ?? "")\"?",
            isPresented: $showUninstall,
            titleVisibility: .visible,
            presenting: uninstallRequest
        ) { request in
            Button("Uninstall", role: .destructive) { uninstall(request) }
            Button("Cancel", role: .cancel) {}
        } message: { request in
            Text(request.fromFile ? "You can reinstall from file at any time." : "You can reinstall at any time.")
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

    // MARK: Lists

    @ViewBuilder private var catalogStatus: some View {
        switch model.state {
        case .loading:
            HStack(spacing: 6) {
                ProgressView()
                    .controlSize(.small)
                Text("Loading catalog…")
                    .foregroundStyle(.secondary)
            }
        case .failed(let message):
            VStack(alignment: .leading, spacing: 4) {
                Text(message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button("Try Again") { Task { await model.load() } }
                    .controlSize(.small)
            }
        case .content, .empty:
            EmptyView()
        }
    }

    /// The heading with its + button. Clicking the title expands or collapses the list, as the chevron does.
    private func header(_ title: String, type: PluginType, expanded: Binding<Bool>) -> some View {
        let addHelp = "Add a \(type == .codeview ? "CodeView" : "Exporter") from a file"
        return HStack {
            HStack {
                Text(title)
                    .font(.title3)
                Spacer()
            }
            .contentShape(Rectangle())
            .onTapGesture {
                withAnimation { expanded.wrappedValue.toggle() }
            }
            Button {
                chooseFile(for: type)
            } label: {
                Image(systemName: "plus")
                    .frame(width: 22, height: 22)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .help(addHelp)
            .accessibilityLabel(addHelp)
        }
    }

    @ViewBuilder private func rows(for type: PluginType) -> some View {
        let items = items(for: type)
        if items.isEmpty {
            Text("None")
                .foregroundStyle(.secondary)
        } else {
            ForEach(items) { item in
                PluginRow(item: item, type: type) { plugin in
                    uninstallRequest = UninstallRequest(plugin: plugin, type: type, fromFile: AppConfig.shared.filePlugins.contains(CatalogInstaller.versionKey(type, plugin.name)))
                    showUninstall = true
                }
                .padding(.leading, -(Self.disclosureIndent + Self.chevronInset))
            }
        }
    }

    /// The installed plugins of `type` together with the catalog entries for it, built-in exporters first.
    private func items(for type: PluginType) -> [PluginItem] {
        let installed: [Plugin]
        let entries: [PluginCatalogEntry]
        let catalog: PluginCatalog? = if case .content(let catalog) = model.state { catalog } else { nil }
        switch type {
        case .codeview:
            // Internal plugins are pre-installed and have no user-facing install or uninstall.
            installed = AppConfig.shared.codeViews.filter { !CodeViewManager.protectedNames.contains($0.name) }
            entries = catalog.map { Array($0.codeview.values) } ?? []
        case .exporter:
            installed = AppConfig.shared.exporters
            entries = catalog.map { Array($0.exporter.values) } ?? []
        }
        let names = Set(installed.map(\.name)).union(entries.map(\.name))
        return names.map { name in
            PluginItem(
                name: name,
                entry: entries.first { $0.name == name },
                installed: installed.first { $0.name == name },
                fromFile: AppConfig.shared.filePlugins.contains(CatalogInstaller.versionKey(type, name))
            )
        }
        .sorted { ($0.isBuiltIn ? 0 : 1, $0.name) < ($1.isBuiltIn ? 0 : 1, $1.name) }
    }

    // MARK: Adding from a file

    /// Asks for a plugin file with a panel of its own: the document view that contains this one already
    /// presents file importers, and SwiftUI does not reliably present nested ones.
    private func chooseFile(for type: PluginType) {
        addPluginType = type
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.javaScript]
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        panel.message = "Choose a \(type == .codeview ? "CodeView" : "Exporter") plugin file"
        Task {
            guard await panel.begin() == .OK, let url = panel.url else {
                addPluginType = nil
                return
            }
            // The access grant is held open until the user confirms or cancels the alert, because the
            // copy does not happen until then. The managers' install stops it once the copy is done.
            guard url.startAccessingSecurityScopedResource() else {
                present(.failure("MarkupEditor was not given access to that file."))
                addPluginType = nil
                return
            }
            prepareToAdd(url)
        }
    }

    private var addDialogTitle: String {
        switch addDialog {
        case .confirm(let pending): "Add \(pending.banner.kind.displayName.prefix(1).uppercased() + pending.banner.kind.displayName.dropFirst())?"
        case .failure: "Could Not Add Plugin"
        case nil: ""
        }
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

    private func present(_ dialog: AddDialog) {
        addDialog = dialog
        showAddDialog = true
    }

    /// Reads and checks the banner of the picked file. The name and extension come from the
    /// plugin itself, so there is nothing for the user to type.
    private func prepareToAdd(_ url: URL) {
        let expected: PluginBanner.Kind = addPluginType == .exporter ? .exporter : .codeview
        do {
            let banner = try PluginBanner.read(from: url)
            try PluginAddCheck.validate(banner, filename: url.lastPathComponent, expected: expected, exporters: AppConfig.shared.exporters, codeViews: AppConfig.shared.codeViews)
            present(.confirm(PendingPlugin(url: url, banner: banner)))
        } catch {
            url.stopAccessingSecurityScopedResource()
            editLog.error("Could not add \(url.lastPathComponent): \(error.localizedDescription)")
            present(.failure(error.localizedDescription))
            addPluginType = nil
        }
    }

    private func cancelAdd(_ pending: PendingPlugin) {
        pending.url.stopAccessingSecurityScopedResource()
        addPluginType = nil
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
                config.recordFileInstall(key: CatalogInstaller.versionKey(banner.kind == .exporter ? .exporter : .codeview, banner.name))
                config.pluginsRevision += 1
            } catch {
                failure = error.localizedDescription
            }
        }
        addPluginType = nil
        if let failure {
            editLog.error("Could not add \(banner.kind.displayName) \(banner.name): \(failure)")
            // Presented after this alert has finished dismissing, which would clear it.
            Task { present(.failure(failure)) }
        } else {
            editLog.info("Added \(banner.kind.displayName) \(banner.name) from \(pending.url.path(percentEncoded: false))")
        }
    }

    // MARK: Uninstalling

    private func uninstall(_ request: UninstallRequest) {
        editLog.info("Uninstalled \(request.type.logName) \(request.plugin.name)")
        switch request.type {
        case .codeview:
            AppConfig.update { config in
                config.codeViews = CodeViewManager.delete(request.plugin, codeViews: config.codeViews, cacheDir: AppDelegate.webViewCacheDir)
                config.recordUninstall(key: CatalogInstaller.versionKey(.codeview, request.plugin.name))
                config.pluginsRevision += 1
            }
        case .exporter:
            AppConfig.update { config in
                config.exporters = ExporterManager.delete(request.plugin, exporters: config.exporters, cacheDir: AppDelegate.webViewCacheDir)
                config.recordUninstall(key: CatalogInstaller.versionKey(.exporter, request.plugin.name))
                config.pluginsRevision += 1
            }
        }
    }
}

/// A plugin that is installed, listed in the catalog, or both.
private struct PluginItem: Identifiable {
    let name: String
    let entry: PluginCatalogEntry?
    let installed: Plugin?
    /// Whether the installed plugin was added from a file.
    var fromFile = false

    var id: String { name }

    var isBuiltIn: Bool {
        installed.map { ExporterManager.builtIn($0) != nil } ?? false
    }
}

private struct PluginRow: View {
    @Environment(EditLog.self) private var editLog
    let item: PluginItem
    let type: PluginType
    let onUninstall: (Plugin) -> Void

    @State private var isInstalling = false
    @State private var installErrorMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                title
                Spacer()
                action
                    .fixedSize()
            }
            if item.installed != nil {
                Label(item.isBuiltIn ? "Built in" : (item.fromFile ? "Installed from file" : "Installed"), systemImage: "checkmark.circle.fill")
                    .labelStyle(.titleAndIcon)
                    .font(.caption)
                    .foregroundStyle(Color.installedPlugin)
            }
            if let entry = item.entry {
                Text(entry.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                if let installErrorMessage {
                    Text(installErrorMessage)
                        .font(.caption)
                        .foregroundStyle(.red)
                }
                HStack {
                    Text("Author: \(entry.authorName)")
                        .font(.caption)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                    Spacer()
                    // The catalog guarantees an https repo, but URL(string:) can still fail on malformed characters.
                    if let repoURL = URL(string: entry.repo) {
                        Link("Source", destination: repoURL)
                            .font(.caption)
                            .fixedSize()
                    }
                }
            }
        }
        .padding(.vertical, 4)
    }

    /// The name, followed by the catalog's version when there is one.
    private var title: Text {
        let name = Text(item.name).font(.headline)
        guard let version = item.entry?.version else { return name }
        let versionText = Text(" v\(version)").font(.subheadline).foregroundStyle(.secondary)
        return Text("\(name)\(versionText)")
    }

    @ViewBuilder private var action: some View {
        if isInstalling {
            ProgressView()
                .controlSize(.small)
        } else if let installed = item.installed {
            if !item.isBuiltIn {
                HStack(spacing: 6) {
                    if let entry = item.entry, updateAvailable(for: entry) {
                        Button("Update") { install(entry) }
                            .controlSize(.small)
                    }
                    Button("Uninstall") { onUninstall(installed) }
                        .controlSize(.small)
                }
            }
        } else if let entry = item.entry {
            Button("Install") { install(entry) }
                .controlSize(.small)
        }
    }

    /// Whether the catalog has a newer version than the recorded installed one. Nothing is offered when the
    /// installed version is unknown.
    private func updateAvailable(for entry: PluginCatalogEntry) -> Bool {
        guard let installed = AppConfig.shared.pluginVersions[CatalogInstaller.versionKey(type, entry.name)] else { return false }
        return PluginVersion.isNewer(entry.version, than: installed)
    }

    private func install(_ entry: PluginCatalogEntry) {
        installErrorMessage = nil
        isInstalling = true
        Task {
            defer { isInstalling = false }
            do {
                try await CatalogInstaller.install(entry, type: type, log: editLog)
            } catch {
                installErrorMessage = error.localizedDescription
            }
        }
    }
}

#Preview {
    PluginsInfoView()
        .environment(EditLog())
}
