//
//  ExporterManager.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 7/15/26.
//

import Foundation
import OSLog

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "ExporterManager")

/// Handles first-launch exporter directory setup.
///
/// Creates the exporters directory under Application Support. The contents of the
/// directory is controlled from the Settings window.
class ExporterManager {
    
    static let shared = ExporterManager()

    /// The URL of the exporter directory under Application Support.
    var defaultDir: URL {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("exporters")
    }

    /// Calls `setupExporters` using the app's current `AppConfig`.
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

        // Add any prepackaged exporters here. See the way Mermaid is done in RendererManager.
    }
    
    func add(name: String, url: URL?) {
        guard !name.isEmpty, let source = url else { return }
        // Balances the startAccessingSecurityScopedResource() call made when the URL was picked
        // in BehaviorSettingsView's fileImporter. Harmless no-op for setupOnLaunch()'s bundle-resource
        // URL, which was never subject to a matching start call.
        defer { source.stopAccessingSecurityScopedResource() }
        let exporter = Plugin(name: name, filename: source.lastPathComponent)
        let destination = defaultDir.appendingPathComponent(exporter.filename)

        guard FileManager.default.fileExists(atPath: source.path(percentEncoded: false)) else {
            logger.warning("Exporter not found: \(exporter.filename)")
            return
        }

        do {
            if FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: source, to: destination)
            logger.info("Saved exporter \(exporter.name): \(exporter.filename)")
            AppConfig.update { config in
                if let index = config.exporters.firstIndex(where: {existing in exporter.name == existing.name}) {
                    config.exporters[index] = exporter
                } else {
                    config.exporters.append(exporter)
                }
            }
        } catch {
            logger.error("Failed to save exporter \(exporter.filename): \(error.localizedDescription)")
        }
    }
    
    func delete(_ exporter: Plugin?) {
        guard let exporter else { return }
        AppConfig.update { config in
            if let index = config.exporters.firstIndex(of: exporter) {
                let url = defaultDir.appendingPathComponent(exporter.filename)
                if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
                    try? FileManager.default.removeItem(at: url)
                }
                config.exporters.remove(at: index)
            }
        }
    }
    
    func exists(_ exporter: Plugin?) -> Bool {
        guard let exporter else { return false }
        return AppConfig.shared.exporters.firstIndex(of: exporter) != nil
    }
    
    func nameExists(_ name: String) -> Bool {
        AppConfig.shared.exporters.first(where: {$0.name == name}) != nil
    }
    
}
