//
//  ExporterManager.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 7/15/26.
//

import Foundation
import OSLog
import MarkupEditor

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

        // The only exporter provided out-of-box is PDF. It is distinct from every other user-supplied plugin
        // because it exports using the WKWebView's createPDF(configuration:completionHandler:) function.
        // As an alternative for any other out-of-box exporters, see the approach in CodeViewManager for Mermaid.
        let pdfExporter = Plugin(name: "PDF", type: "exporter", ext: "pdf")
        AppConfig.update { config in
            if config.exporters.firstIndex(where: {existing in pdfExporter.name == existing.name}) == nil {
                logger.info("Added exporter \(pdfExporter.name)")
                config.exporters.insert(pdfExporter, at: 0)
            }
        }
        PluginCacheSync.sync()
    }
    
    func add(name: String, url: URL?, ext: String) {
        guard !name.isEmpty, let source = url else { return }
        // Balances the startAccessingSecurityScopedResource() call made when the URL was picked
        // in PluginSettingsView's fileImporter. Harmless no-op for setupOnLaunch()'s bundle-resource
        // URL, which was never subject to a matching start call.
        defer { source.stopAccessingSecurityScopedResource() }
        let filename = source.lastPathComponent
        let exporter = Plugin(name: name, type: "exporter", filename: filename, ext: ext)
        let destination = defaultDir.appendingPathComponent(filename)

        guard FileManager.default.fileExists(atPath: source.path(percentEncoded: false)) else {
            logger.warning("Exporter not found: \(filename)")
            return
        }

        do {
            if FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: source, to: destination)
            logger.info("Saved exporter \(exporter.name): \(filename)")
            AppConfig.update { config in
                if let index = config.exporters.firstIndex(where: {existing in exporter.name == existing.name}) {
                    config.exporters[index] = exporter
                } else {
                    config.exporters.append(exporter)
                }
            }
            PluginCacheSync.sync()
        } catch {
            logger.error("Failed to save exporter \(filename): \(error.localizedDescription)")
        }
    }

    func delete(_ exporter: Plugin?) {
        guard let exporter, let filename = exporter.filename else { return }
        AppConfig.update { config in
            if let index = config.exporters.firstIndex(of: exporter) {
                let url = defaultDir.appendingPathComponent(filename)
                if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
                    try? FileManager.default.removeItem(at: url)
                }
                PluginCacheSync.remove(filename: filename)
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
