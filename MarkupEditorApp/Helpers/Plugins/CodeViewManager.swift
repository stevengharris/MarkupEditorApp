//
//  CodeViewManager.swift
//  MarkupEditorApp

import Foundation
import OSLog
import MarkupEditor

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "CodeViewManager")

/// Handles first-launch codeview directory setup.
///
/// Creates the codeviews directory under Application Support. The contents of the
/// directory is controlled from the Settings window but is prepopulated with Mermaid
/// as bundled with the app.
class CodeViewManager {

    static let shared = CodeViewManager()

    /// The URL of the codeview directory under Application Support.
    var defaultDir: URL {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("codeviews")
    }
    let mermaid = Plugin(name: "Mermaid", type: "codeview", filename: "markupeditor-mermaid.js")

    /// Calls `setupCodeViews` using the app's current `AppConfig`.
    func setupOnLaunch() {
        do {
            try FileManager.default.createDirectory(
                at: defaultDir,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            logger.error("Failed to create directory at \(self.defaultDir.path(percentEncoded: false)): \(error.localizedDescription)")
            return
        }

        // Add built-in Mermaid support if it is not already present in the defaultDir.
        // When initially installed, Mermaid needs to be put in place in the defaultDir
        // using the file from Resources. However, the user may have replaced it later with
        // something else, so we need to avoid overwriting that. By the same token, if we
        // are doing work on or updating the Mermaid codeview support, we need to replace
        // it if that exists.
        // TODO: Tighten up the logic to avoid edge cases
        guard
            let filename = mermaid.filename,
            let source = Bundle.main.resourceURL?.appendingPathComponent(filename)
        else {
            logger.warning("Resource URL was not found.")
            return
        }
        add(name: mermaid.name, url: source)
    }

    func add(name: String, url: URL?) {
        guard !name.isEmpty, let source = url else { return }
        // Balances the startAccessingSecurityScopedResource() call made when the URL was picked
        // in BehaviorSettingsView's fileImporter. Harmless no-op for setupOnLaunch()'s bundle-resource
        // URL, which was never subject to a matching start call.
        defer { source.stopAccessingSecurityScopedResource() }
        let filename = source.lastPathComponent
        let codeview = Plugin(name: name, type: "codeview", filename: filename)
        let destination = defaultDir.appendingPathComponent(filename)

        guard FileManager.default.fileExists(atPath: source.path(percentEncoded: false)) else {
            logger.warning("CodeView not found: \(filename)")
            return
        }

        do {
            if FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                try FileManager.default.removeItem(at: destination)
                logger.info("Removed existing codeview file: \(filename)")
            }
            try FileManager.default.copyItem(at: source, to: destination)
            logger.info("Added codeview \(codeview.name): \(filename)")
            AppConfig.update { config in
                if let index = config.codeViews.firstIndex(where: {existing in codeview.name == existing.name}) {
                    config.codeViews[index] = codeview
                } else {
                    config.codeViews.append(codeview)
                }
            }
        } catch {
            logger.error("Failed to save codeview \(filename): \(error.localizedDescription)")
        }
    }

    func delete(_ codeview: Plugin?) {
        guard let codeview, let filename = codeview.filename else { return }
        AppConfig.update { config in
            if let index = config.codeViews.firstIndex(of: codeview) {
                let url = defaultDir.appendingPathComponent(filename)
                if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
                    try? FileManager.default.removeItem(at: url)
                }
                config.codeViews.remove(at: index)
            }
        }
    }

    func exists(_ codeview: Plugin?) -> Bool {
        guard let codeview else { return false }
        return AppConfig.shared.codeViews.firstIndex(of: codeview) != nil
    }

    func nameExists(_ name: String) -> Bool {
        AppConfig.shared.codeViews.first(where: {$0.name == name}) != nil
    }

}
