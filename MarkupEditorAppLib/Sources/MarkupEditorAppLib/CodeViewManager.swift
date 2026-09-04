//
//  CodeViewManager.swift
//  MarkupEditorAppLib
//

import Foundation
import OSLog
import MarkupEditor

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorAppLib", category: "CodeViewManager")

/// Manages the codeviews directory under Application Support: first-launch setup (prepopulated
/// with the bundled Mermaid codeview), add, delete, and membership checks.
///
/// Every method is caller-injected/pure-returning rather than reading/writing a shared config
/// singleton: this package has no knowledge of `AppConfig` or `Bundle.main` (both stay app-side).
/// The caller reads its own config, calls in with the current lists, and writes the returned list
/// back.
public enum CodeViewManager {

    // Computed, not a stored global constant: Plugin (from the MarkupEditor package) isn't
    // provably Sendable across the module boundary, so a stored `static let` here is flagged
    // as unsynchronized global mutable state under strict concurrency even though the value
    // never actually changes.
    public static var mermaid: Plugin {
        Plugin(name: "Mermaid", type: "codeview", filename: "markupeditor-codeview-mermaid.js")
    }

    /// Codeview plugins pre-installed unconditionally via `syncInternalPlugins`, never
    /// user-visible or user-removable. Adding a new one is a single new case here -- it's
    /// automatically picked up by `protectedNames` and `syncInternalPlugins` below, not
    /// something to wire into multiple places by hand.
    public enum InternalCodeView: String, CaseIterable {
        case metadata = "Metadata"
        case htmlFrontMatter = "HTMLFrontMatter"

        var filename: String {
            switch self {
            case .metadata: "markupeditor-codeview-metadata.js"
            case .htmlFrontMatter: "markupeditor-codeview-htmlfrontmatter.js"
            }
        }

        var plugin: Plugin { Plugin(name: rawValue, type: "codeview", filename: filename) }
    }

    /// Names no caller may add, display, or delete through the ordinary user-facing flows.
    /// Checked by name (not by `Plugin` equality) so a user can't hijack a slot by installing
    /// their own plugin under one of these names.
    public static let protectedNames: Set<String> = Set(InternalCodeView.allCases.map(\.rawValue))

    /// The URL of the codeview directory under Application Support.
    public static var defaultDir: URL {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("codeviews")
    }

    /// First-launch setup: ensures `defaultDir` exists and the bundled Mermaid codeview is
    /// present. `resourceURL` is the app bundle's resource directory (`Bundle.main.resourceURL`
    /// at the app-side call site) -- injected since this package can't reach `Bundle.main`
    /// itself. Returns the updated codeViews list (unchanged if Mermaid is already present, or
    /// if setup failed).
    ///
    /// Caller-gated to run once, at true first launch: calling this again would re-copy the
    /// bundled Mermaid codeview over anything the user installed in its place via Settings.
    public static func setupOnLaunch(exporters: [Plugin], codeViews: [Plugin], resourceURL: URL?, cacheDir: URL) -> [Plugin] {
        do {
            try FileManager.default.createDirectory(
                at: defaultDir,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            logger.error("Failed to create directory at \(defaultDir.path(percentEncoded: false)): \(error.localizedDescription)")
            return codeViews
        }

        guard
            let filename = mermaid.filename,
            let source = resourceURL?.appendingPathComponent(filename)
        else {
            logger.warning("Resource URL was not found.")
            return codeViews
        }
        return add(name: mermaid.name, url: source, exporters: exporters, codeViews: codeViews, cacheDir: cacheDir)
    }

    /// Re-syncs every internal plugin (`InternalCodeView.allCases`) from the app bundle,
    /// unconditionally, every launch -- not gated by the first-launch-only check
    /// `setupOnLaunch` uses, since an internal plugin has no user-facing update mechanism
    /// and must pick up a newer bundled copy.
    public static func syncInternalPlugins(exporters: [Plugin], codeViews: [Plugin], resourceURL: URL?, cacheDir: URL) -> [Plugin] {
        guard let resourceURL else {
            logger.warning("Resource URL was not found.")
            return codeViews
        }
        var updated = codeViews
        for internalCodeView in InternalCodeView.allCases {
            let source = resourceURL.appendingPathComponent(internalCodeView.filename)
            updated = add(name: internalCodeView.plugin.name, url: source, exporters: exporters, codeViews: updated, cacheDir: cacheDir, allowProtectedNames: true)
        }
        return updated
    }

    /// - Parameter allowProtectedNames: Escape hatch for `syncInternalPlugins` alone -- ordinary
    ///   callers leave this at its default and are refused for a name in `protectedNames`.
    public static func add(name: String, url: URL?, exporters: [Plugin], codeViews: [Plugin], cacheDir: URL, allowProtectedNames: Bool = false) -> [Plugin] {
        guard !name.isEmpty, let source = url else { return codeViews }
        guard allowProtectedNames || !protectedNames.contains(name) else {
            logger.warning("Refused to add codeview using protected name: \(name)")
            return codeViews
        }
        // Balances the startAccessingSecurityScopedResource() call made when the URL was picked
        // in the app's plugin settings UI's fileImporter. Harmless no-op for setupOnLaunch()'s
        // bundle-resource URL, which was never subject to a matching start call.
        defer { source.stopAccessingSecurityScopedResource() }
        let filename = source.lastPathComponent
        let codeview = Plugin(name: name, type: "codeview", filename: filename)
        let destination = defaultDir.appendingPathComponent(filename)

        guard FileManager.default.fileExists(atPath: source.path(percentEncoded: false)) else {
            logger.warning("CodeView not found: \(filename)")
            return codeViews
        }

        do {
            if FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                try FileManager.default.removeItem(at: destination)
                logger.info("Removed existing codeview file: \(filename)")
            }
            try FileManager.default.copyItem(at: source, to: destination)
            logger.info("Added codeview \(codeview.name): \(filename)")
            var updated = codeViews
            if let index = updated.firstIndex(where: { existing in codeview.name == existing.name }) {
                updated[index] = codeview
            } else {
                updated.append(codeview)
            }
            PluginCacheSync.sync(cacheDir: cacheDir, exporters: exporters, codeViews: updated)
            return updated
        } catch {
            logger.error("Failed to save codeview \(filename): \(error.localizedDescription)")
            return codeViews
        }
    }

    public static func delete(_ codeview: Plugin?, codeViews: [Plugin], cacheDir: URL) -> [Plugin] {
        guard let codeview, let filename = codeview.filename,
              let index = codeViews.firstIndex(of: codeview) else { return codeViews }
        guard !protectedNames.contains(codeview.name) else {
            logger.warning("Refused to delete protected codeview: \(codeview.name)")
            return codeViews
        }
        let url = defaultDir.appendingPathComponent(filename)
        if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
            try? FileManager.default.removeItem(at: url)
        }
        PluginCacheSync.remove(filename: filename, cacheDir: cacheDir)
        var updated = codeViews
        updated.remove(at: index)
        return updated
    }

    public static func exists(_ codeview: Plugin?, in codeViews: [Plugin]) -> Bool {
        guard let codeview else { return false }
        return codeViews.firstIndex(of: codeview) != nil
    }

    public static func nameExists(_ name: String, in codeViews: [Plugin]) -> Bool {
        codeViews.first(where: { $0.name == name }) != nil
    }

}
