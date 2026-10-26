//
//  PluginsWelcomeModel.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// The plugins the user has checked on the Welcome page, installed when the page is left.
@MainActor
@Observable
final class PluginsWelcomeModel {

    static let unavailableMessage = "Use the Plugins tab in the side panel to install plugins when the network is available."

    let discovery: PluginDiscoveryModel
    /// Keys from `CatalogInstaller.versionKey` of the checked plugins.
    var selected: Set<String> = []
    private(set) var isInstalling = false
    /// One line for each checked plugin that could not be installed.
    private(set) var failures: [String] = []
    /// Set once the failures have been shown, so the next Next moves on instead of retrying.
    var failuresShown = false

    /// Receives the result of each install, once the Welcome has the app's log.
    var editLog: EditLog?

    private var install: ((PluginCatalogEntry, PluginType) async throws -> Void)!
    private let isInstalled: (PluginType, String) -> Bool

    init(
        discovery: PluginDiscoveryModel = PluginDiscoveryModel(),
        install: ((PluginCatalogEntry, PluginType) async throws -> Void)? = nil,
        isInstalled: @escaping (PluginType, String) -> Bool = { type, name in
            switch type {
            case .codeview: CodeViewManager.nameExists(name, in: AppConfig.shared.codeViews)
            case .exporter: ExporterManager.nameExists(name, in: AppConfig.shared.exporters)
            }
        }
    ) {
        self.discovery = discovery
        self.isInstalled = isInstalled
        self.install = install ?? { [weak self] entry, type in
            try await CatalogInstaller.install(entry, type: type, log: self?.editLog)
        }
    }

    /// The catalog's plugins of `type` by name, empty until the catalog has loaded.
    func entries(for type: PluginType) -> [PluginCatalogEntry] {
        guard case .content(let catalog) = discovery.state else { return [] }
        let entries = type == .codeview ? catalog.codeview : catalog.exporter
        return entries.values.sorted { $0.name < $1.name }
    }

    func isAlreadyInstalled(_ entry: PluginCatalogEntry, type: PluginType) -> Bool {
        isInstalled(type, entry.name)
    }

    func isSelected(_ entry: PluginCatalogEntry, type: PluginType) -> Bool {
        selected.contains(CatalogInstaller.versionKey(type, entry.name))
    }

    func setSelected(_ on: Bool, entry: PluginCatalogEntry, type: PluginType) {
        let key = CatalogInstaller.versionKey(type, entry.name)
        if on { selected.insert(key) } else { selected.remove(key) }
    }

    /// Installs the checked plugins one at a time, because each install builds on the list the last one left.
    func installSelected() async {
        isInstalling = true
        failures = []
        for type in [PluginType.codeview, .exporter] {
            for entry in entries(for: type) where isSelected(entry, type: type) && !isAlreadyInstalled(entry, type: type) {
                do {
                    try await install(entry, type)
                    setSelected(false, entry: entry, type: type)
                } catch {
                    failures.append("\(entry.name): \(error.localizedDescription)")
                }
            }
        }
        isInstalling = false
    }
}
