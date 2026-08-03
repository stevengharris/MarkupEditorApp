//
//  PluginCacheSync.swift
//  MarkupEditorApp
//

import Foundation
import OSLog
import MarkupEditor

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "PluginCacheSync")

/// Copies registered plugin files from their persistent homes (`ExporterManager`/`CodeViewManager`'s
/// Application Support directories) into the WKWebView's runtime cache directory, where
/// `MarkupWKWebView.initRootFiles()` copies `markup-editor.js` and where the `plugins="..."` attribute's
/// bare filenames actually get dynamically imported from.
///
/// `initRootFiles()` resolves plugin files via `url(forResource:withExtension:)`, which only searches
/// the app/package bundle — it has no knowledge of Application Support. A plugin installed via
/// `PluginSettingsView`'s fileImporter (or the bundled Mermaid codeview, which happens to also ship as
/// a Resource) only reaches the cache directory if something copies it there explicitly. That's this.
///
/// All mechanics and knowledge of plugins live here in MarkupEditorApp; `MarkupEditor` itself is
/// unchanged. `initRootFiles()` only touches files it resolves itself, never clearing the directory
/// wholesale, so syncing here doesn't race with or get clobbered by it.
enum PluginCacheSync {

    /// Copy every currently-registered exporter and codeview plugin file into the runtime cache
    /// directory. Call after any change to `AppConfig.shared.exporters`/`codeViews` (including at
    /// first launch, before any webview exists yet).
    static func sync() {
        let cacheDir = AppDelegate.webViewCacheDir

        let fileManager = FileManager.default
        do {
            try fileManager.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        } catch {
            logger.error("Failed to create directory at \(cacheDir.path(percentEncoded: false)): \(error.localizedDescription)")
            return
        }

        let sources: [(source: URL, filename: String)] =
            AppConfig.shared.exporters.compactMap { plugin in
                plugin.filename.map { (ExporterManager.shared.defaultDir.appendingPathComponent($0), $0) }
            } +
            AppConfig.shared.codeViews.compactMap { plugin in
                plugin.filename.map { (CodeViewManager.shared.defaultDir.appendingPathComponent($0), $0) }
            }

        for (source, filename) in sources {
            guard fileManager.fileExists(atPath: source.path(percentEncoded: false)) else { continue }
            let destination = cacheDir.appendingPathComponent(filename)
            do {
                if fileManager.fileExists(atPath: destination.path(percentEncoded: false)) {
                    try fileManager.removeItem(at: destination)
                }
                try fileManager.copyItem(at: source, to: destination)
            } catch {
                logger.error("Failed to sync \(filename) to cache: \(error.localizedDescription)")
            }
        }
    }

    /// Remove a single plugin file from the runtime cache directory. Call from `ExporterManager`/
    /// `CodeViewManager`'s `delete()` -- `sync()` only adds/updates, it never removes files for
    /// plugins that are no longer registered.
    static func remove(filename: String) {
        let destination = AppDelegate.webViewCacheDir.appendingPathComponent(filename)
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: destination.path(percentEncoded: false)) else { return }
        do {
            try fileManager.removeItem(at: destination)
        } catch {
            logger.error("Failed to remove \(filename) from cache: \(error.localizedDescription)")
        }
    }

}
