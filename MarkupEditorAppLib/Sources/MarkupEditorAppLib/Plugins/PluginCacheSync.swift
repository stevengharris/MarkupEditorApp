//
//  PluginCacheSync.swift
//  MarkupEditorAppLib
//

import Foundation
import OSLog
import MarkupEditor

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorAppLib", category: "PluginCacheSync")

/// Copies registered plugin files from their persistent homes (`ExporterManager`/`CodeViewManager`'s
/// Application Support directories) into the WKWebView's runtime cache directory, where
/// `MarkupWKWebView.initRootFiles()` copies `markup-editor.js` and where the `plugins="..."` attribute's
/// bare filenames actually get dynamically imported from.
///
/// `initRootFiles()` resolves plugin files via `url(forResource:withExtension:)`, which only searches
/// the app/package bundle — it has no knowledge of Application Support. A plugin installed via the
/// app's own plugin settings UI (or the bundled Mermaid codeview, which happens to also ship as
/// a Resource) only reaches the cache directory if something copies it there explicitly. That's this.
///
/// `initRootFiles()` only touches files it resolves itself, never clearing the directory wholesale,
/// so syncing here doesn't race with or get clobbered by it. `cacheDir`/`exporters`/`codeViews` are
/// caller-injected rather than read from `AppDelegate`/`AppConfig.shared`, since this package has no
/// knowledge of either -- the caller passes its own locally-computed values straight through.
public enum PluginCacheSync {

    /// Copy every currently-registered exporter and codeview plugin file into `cacheDir`. Call
    /// after any change to the exporter/codeview lists (including at first launch, before any
    /// webview exists yet).
    public static func sync(cacheDir: URL, exporters: [Plugin], codeViews: [Plugin]) {
        let fileManager = FileManager.default
        do {
            try fileManager.createDirectory(at: cacheDir, withIntermediateDirectories: true)
        } catch {
            logger.error("Failed to create directory at \(cacheDir.path(percentEncoded: false)): \(error.localizedDescription)")
            return
        }

        let sources: [(source: URL, filename: String)] =
            exporters.compactMap { plugin in
                plugin.filename.map { (ExporterManager.defaultDir.appendingPathComponent($0), $0) }
            } +
            codeViews.compactMap { plugin in
                plugin.filename.map { (CodeViewManager.defaultDir.appendingPathComponent($0), $0) }
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

    /// Remove a single plugin file from `cacheDir`. Call from `ExporterManager`/`CodeViewManager`'s
    /// `delete()` -- `sync()` only adds/updates, it never removes files for plugins that are no
    /// longer registered.
    public static func remove(filename: String, cacheDir: URL) {
        let destination = cacheDir.appendingPathComponent(filename)
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: destination.path(percentEncoded: false)) else { return }
        do {
            try fileManager.removeItem(at: destination)
        } catch {
            logger.error("Failed to remove \(filename) from cache: \(error.localizedDescription)")
        }
    }

}
