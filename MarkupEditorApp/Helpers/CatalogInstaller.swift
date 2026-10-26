//
//  CatalogInstaller.swift
//  MarkupEditorApp
//

import Foundation
import MarkupEditor
import MarkupEditorAppLib

/// Installs a plugin from the catalog into the app's configuration.
@MainActor
struct CatalogInstaller {

    /// The key under which `AppConfig.pluginVersions` records the version of an installed plugin.
    static func versionKey(_ type: PluginType, _ name: String) -> String {
        "\(type == .codeview ? "codeview" : "exporter")/\(name)"
    }

    /// Downloads and installs `entry`, replacing an installed plugin of the same name, and records its version.
    /// The result, success or failure, is written to `log`.
    static func install(_ entry: PluginCatalogEntry, type: PluginType, log: EditLog? = nil) async throws {
        let replacing = AppConfig.shared.pluginVersions[versionKey(type, entry.name)] != nil
        do {
            let (exporters, codeViews) = try await installPlugin(
                entry, type: type,
                exporters: AppConfig.shared.exporters,
                codeViews: AppConfig.shared.codeViews,
                cacheDir: AppDelegate.webViewCacheDir
            )
            AppConfig.update { config in
                config.exporters = exporters
                config.codeViews = codeViews
                config.recordCatalogInstall(key: versionKey(type, entry.name), version: entry.version)
                config.pluginsRevision += 1
            }
            log?.info("\(replacing ? "Updated" : "Installed") \(type.logName) \(entry.name) v\(entry.version) from the plugin catalog")
        } catch {
            log?.error("Could not install \(type.logName) \(entry.name): \(error.localizedDescription)")
            throw error
        }
    }
}
