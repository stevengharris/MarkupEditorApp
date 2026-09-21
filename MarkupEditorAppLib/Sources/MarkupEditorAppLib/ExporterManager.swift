//
//  ExporterManager.swift
//  MarkupEditorAppLib
//

import Foundation
import OSLog
import MarkupEditor

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorAppLib", category: "ExporterManager")

/// Manages the exporters directory under Application Support: first-launch setup, the built-in
/// HTML and PDF exporters, add, delete, and membership checks.
///
/// Every method is caller-injected/pure-returning rather than reading/writing a shared config
/// singleton: this package has no knowledge of `AppConfig` (stays app-side). The caller reads
/// its own config, calls in with the current lists, and writes the returned list back.
public enum ExporterManager {

    // Computed, not a stored global constant: Plugin (from the MarkupEditor package) isn't
    // provably Sendable across the module boundary, so a stored `static let` here is flagged
    // as unsynchronized global mutable state under strict concurrency even though the value
    // never actually changes.
    public static var docx: Plugin {
        Plugin(name: "DocX", type: "exporter", filename: "exporter-docx.js", ext: "docx")
    }

    /// Exporters the app implements itself, so they have no file and are not registered with the
    /// editor. They always lead the exporters list, in this order.
    public enum BuiltIn: String, CaseIterable {
        case html = "HTML"
        case pdf = "PDF"

        public var plugin: Plugin {
            Plugin(name: rawValue, type: "exporter", ext: rawValue.lowercased())
        }
    }

    /// The built-in exporter `plugin` stands for, or nil for one installed from a file, which
    /// takes precedence even when it shares a built-in's name.
    public static func builtIn(_ plugin: Plugin) -> BuiltIn? {
        guard plugin.filename == nil else { return nil }
        return BuiltIn(rawValue: plugin.name)
    }

    /// Returns `exporters` with the built-in exporters first, followed by the rest in their
    /// existing order. Idempotent, and restores a list saved before a built-in existed.
    public static func ensureBuiltIns(_ exporters: [Plugin]) -> [Plugin] {
        let ensured = BuiltIn.allCases.map(\.plugin) + exporters.filter { builtIn($0) == nil }
        if ensured != exporters { logger.info("Updated built-in exporters") }
        return ensured
    }

    /// The order of the Export menu's items: `exporters` in order, with a nil entry for a
    /// separator between the built-in exporters and any that follow them.
    public static func menuLayout(for exporters: [Plugin]) -> [Plugin?] {
        var layout: [Plugin?] = []
        var previousWasBuiltIn = false
        for exporter in exporters {
            let isBuiltIn = builtIn(exporter) != nil
            if previousWasBuiltIn && !isBuiltIn { layout.append(nil) }
            layout.append(exporter)
            previousWasBuiltIn = isBuiltIn
        }
        return layout
    }

    /// The URL of the exporter directory under Application Support.
    public static var defaultDir: URL {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("exporters")
    }

    /// First-launch setup: ensures `defaultDir` exists, the built-in exporters are listed,
    /// and the bundled DocX exporter is installed from `resourceURL` (mirrors CodeViewManager's
    /// Mermaid handling). The built-ins are distinct from every other exporter because the app
    /// exports them natively rather than through a JS module file, so they're just list
    /// insertions, no file to copy. `resourceURL` is the app bundle's resource directory (`Bundle.main.
    /// resourceURL` at the app-side call site) -- injected since this package can't reach
    /// `Bundle.main` itself. Returns the updated exporters list.
    ///
    /// Caller-gated to run once, at true first launch: calling this again would re-copy the
    /// bundled DocX exporter over anything the user installed in its place via Settings.
    public static func setupOnLaunch(exporters: [Plugin], codeViews: [Plugin], resourceURL: URL?, cacheDir: URL) -> [Plugin] {
        do {
            try FileManager.default.createDirectory(
                at: defaultDir,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            logger.error("Failed to create directory at \(defaultDir.path(percentEncoded: false)): \(error.localizedDescription)")
            return exporters
        }

        let updated = ensureBuiltIns(exporters)

        guard
            let filename = docx.filename,
            let source = resourceURL?.appendingPathComponent(filename)
        else {
            logger.warning("Resource URL was not found.")
            PluginCacheSync.sync(cacheDir: cacheDir, exporters: updated, codeViews: codeViews)
            return updated
        }
        return add(name: docx.name, url: source, ext: docx.ext ?? "docx", exporters: updated, codeViews: codeViews, cacheDir: cacheDir)
    }

    /// Adds the exporter, returning the list unchanged when the copy fails (which is logged).
    public static func add(name: String, url: URL?, ext: String, exporters: [Plugin], codeViews: [Plugin], cacheDir: URL) -> [Plugin] {
        guard !name.isEmpty, let source = url else { return exporters }
        do {
            return try install(name: name, url: source, ext: ext, exporters: exporters, codeViews: codeViews, cacheDir: cacheDir)
        } catch {
            logger.error("Failed to add exporter \(name): \(error.localizedDescription)")
            return exporters
        }
    }

    /// Copies the exporter's file into `defaultDir` and returns the list with it recorded,
    /// replacing an entry of the same name. Throws when the file cannot be installed; an
    /// installed copy is left intact in that case.
    public static func install(name: String, url source: URL, ext: String, exporters: [Plugin], codeViews: [Plugin], cacheDir: URL) throws(PluginInstallError) -> [Plugin] {
        // Balances the startAccessingSecurityScopedResource() call made when the URL was picked
        // in the app's plugin settings UI's fileImporter. Harmless no-op for setupOnLaunch()'s
        // bundle-resource URL, which was never subject to a matching start call.
        defer { source.stopAccessingSecurityScopedResource() }
        let filename = source.lastPathComponent
        let exporter = Plugin(name: name, type: "exporter", filename: filename, ext: ext)
        try PluginFileInstaller.install(source: source, destination: defaultDir.appendingPathComponent(filename))
        logger.info("Saved exporter \(exporter.name): \(filename)")
        var updated = exporters
        if let index = updated.firstIndex(where: { existing in exporter.name == existing.name }) {
            updated[index] = exporter
        } else {
            updated.append(exporter)
        }
        PluginCacheSync.sync(cacheDir: cacheDir, exporters: updated, codeViews: codeViews)
        return updated
    }

    public static func delete(_ exporter: Plugin?, exporters: [Plugin], cacheDir: URL) -> [Plugin] {
        guard let exporter, let filename = exporter.filename,
              let index = exporters.firstIndex(of: exporter) else { return exporters }
        let url = defaultDir.appendingPathComponent(filename)
        if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
            try? FileManager.default.removeItem(at: url)
        }
        PluginCacheSync.remove(filename: filename, cacheDir: cacheDir)
        var updated = exporters
        updated.remove(at: index)
        return updated
    }

    public static func exists(_ exporter: Plugin?, in exporters: [Plugin]) -> Bool {
        guard let exporter else { return false }
        return exporters.firstIndex(of: exporter) != nil
    }

    public static func nameExists(_ name: String, in exporters: [Plugin]) -> Bool {
        exporters.first(where: { $0.name == name }) != nil
    }

}
