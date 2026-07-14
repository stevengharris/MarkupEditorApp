//
//  PluginSetup.swift
//  MarkupEditorApp

import Foundation
import OSLog

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "PluginSetup")

/// Handles first-launch plugin directory setup.
///
/// Creates the plugin directory under Application Support and copies any bundled plugin
/// files that are not already present. Existing files are never overwritten so that
/// user customisations are preserved.
enum PluginSetup {

    /// The URL of the plugin directory under Application Support.
    static var defaultPluginDir: URL {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("MarkupEditorApp/Plugins")
    }

    /// Sets up the plugin directory and copies missing bundled plugin files.
    ///
    /// - Parameters:
    ///   - entries: Plugin config entries (typically from `AppConfig.shared.plugins`).
    ///   - pluginDir: Destination directory (defaults to `defaultPluginDir`).
    ///   - bundleResourceURL: Directory to look up source files in (defaults to
    ///     `Bundle.main.resourceURL`). Injected for testability.
    static func setupPluginDirectory(
        entries: [AppConfig.PluginConfigEntry],
        pluginDir: URL? = nil,
        bundleResourceURL: URL? = nil
    ) {
        let dir = pluginDir ?? defaultPluginDir
        let resourceRoot = bundleResourceURL ?? Bundle.main.resourceURL

        // 1. Create the plugin directory if it doesn't exist.
        do {
            try FileManager.default.createDirectory(
                at: dir,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            logger.error("Failed to create plugin directory at \(dir.path(percentEncoded: false)): \(error.localizedDescription)")
            return
        }

        guard let resourceRoot else {
            logger.error("Bundle.main.resourceURL is nil — cannot copy plugin files")
            return
        }

        // 2. Copy each bundled plugin file, overwriting any existing file.
        // Always overwrite so that app updates and user-replaced plugins are refreshed on launch.
        for entry in entries {
            let source = resourceRoot.appendingPathComponent(entry.filename)
            let destination = dir.appendingPathComponent(entry.filename)

            guard FileManager.default.fileExists(atPath: source.path(percentEncoded: false)) else {
                logger.warning("Bundled plugin file not found: \(entry.filename) — skipping")
                continue
            }

            do {
                if FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                    try FileManager.default.removeItem(at: destination)
                }
                try FileManager.default.copyItem(at: source, to: destination)
                logger.info("Copied bundled plugin: \(entry.filename)")
            } catch {
                logger.error("Failed to copy plugin \(entry.filename): \(error.localizedDescription)")
            }
        }
    }

    /// Calls `setupPluginDirectory` using the app's current `AppConfig`.
    static func setupOnLaunch() {
        let entries = AppConfig.shared.plugins ?? []
        setupPluginDirectory(entries: entries)
    }

}
