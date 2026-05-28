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
    ///   - entries: Plugin config entries (typically from `AppConfig.fromDefaults().plugins`).
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
            logger.error("Failed to create plugin directory at \(dir.path): \(error.localizedDescription)")
            return
        }

        guard let resourceRoot else {
            logger.error("Bundle.main.resourceURL is nil — cannot copy plugin files")
            return
        }

        // 2. Copy each bundled plugin file if the destination does not already exist.
        for entry in entries {
            let source = resourceRoot.appendingPathComponent(entry.filename)
            let destination = dir.appendingPathComponent(entry.filename)

            guard FileManager.default.fileExists(atPath: source.path) else {
                logger.warning("Bundled plugin file not found: \(entry.filename) — skipping")
                continue
            }

            guard !FileManager.default.fileExists(atPath: destination.path) else {
                logger.debug("Plugin file already exists, skipping: \(entry.filename)")
                continue
            }

            do {
                try FileManager.default.copyItem(at: source, to: destination)
                logger.info("Copied bundled plugin: \(entry.filename)")
            } catch {
                logger.error("Failed to copy plugin \(entry.filename): \(error.localizedDescription)")
            }
        }
    }

    /// Calls `setupPluginDirectory` using the app's current `AppConfig`.
    static func setupOnLaunch() {
        let entries = AppConfig.fromDefaults().plugins ?? []
        setupPluginDirectory(entries: entries)
    }

}
