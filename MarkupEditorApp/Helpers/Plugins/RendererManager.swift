//
//  RendererManager.swift
//  MarkupEditorApp

import Foundation
import OSLog

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "RendererManager")

/// Handles first-launch renderer directory setup.
///
/// Creates the renderers directory under Application Support. The contents of the
/// directory is controlled from the Settings window but is prepopulated with Mermaid
/// as bundled with the app.
class RendererManager {
    
    static let shared = RendererManager()

    /// The URL of the renderer directory under Application Support.
    var defaultDir: URL {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("renderers")
    }
    let mermaid = Plugin(name: "Mermaid", filename: "markupeditor-mermaid.js")

    /// Calls `setupRenderers` using the app's current `AppConfig`.
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
        // are doing work on or updating the Mermaid renderer support, we need to replace
        // it if that exists.
        // TODO: Tighten up the logic to avoid edge cases
        guard let source = Bundle.main.resourceURL?.appendingPathComponent(mermaid.filename) else {
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
        let renderer = Plugin(name: name, filename: source.lastPathComponent)
        let destination = defaultDir.appendingPathComponent(renderer.filename)

        guard FileManager.default.fileExists(atPath: source.path(percentEncoded: false)) else {
            logger.warning("Renderer not found: \(renderer.filename)")
            return
        }

        do {
            if FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: source, to: destination)
            logger.info("Saved renderer \(renderer.name): \(renderer.filename)")
            AppConfig.update { config in
                if let index = config.renderers.firstIndex(where: {existing in renderer.name == existing.name}) {
                    config.renderers[index] = renderer
                } else {
                    config.renderers.append(renderer)
                }
            }
        } catch {
            logger.error("Failed to save renderer \(renderer.filename): \(error.localizedDescription)")
        }
    }
    
    func delete(_ renderer: Plugin?) {
        guard let renderer else { return }
        AppConfig.update { config in
            if let index = config.renderers.firstIndex(of: renderer) {
                let url = defaultDir.appendingPathComponent(renderer.filename)
                if FileManager.default.fileExists(atPath: url.path(percentEncoded: false)) {
                    try? FileManager.default.removeItem(at: url)
                }
                config.renderers.remove(at: index)
            }
        }
    }
    
    func exists(_ renderer: Plugin?) -> Bool {
        guard let renderer else { return false }
        return AppConfig.shared.renderers.firstIndex(of: renderer) != nil
    }
    
    func nameExists(_ name: String) -> Bool {
        AppConfig.shared.renderers.first(where: {$0.name == name}) != nil
    }
    
}
