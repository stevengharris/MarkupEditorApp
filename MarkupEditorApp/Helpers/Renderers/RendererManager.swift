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
    var renderers: [RendererConfigEntry] = []

    /// The URL of the renderer directory under Application Support.
    static var defaultDir: URL {
        let support = FileManager.default
            .urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return support.appendingPathComponent("renderers")
    }
    static let mermaidFilename: String = "markupeditor-mermaid.js"

    /// Calls `setupRenderers` using the app's current `AppConfig`.
    static func setupOnLaunch() {
        do {
            try FileManager.default.createDirectory(
                at: defaultDir,
                withIntermediateDirectories: true,
                attributes: nil
            )
        } catch {
            logger.error("Failed to create renderer directory at \(defaultDir.path(percentEncoded: false)): \(error.localizedDescription)")
            return
        }

        // Add built-in Mermaid support if it is not already present in the defaultDir.
        // When initially installed, Mermaid needs to be put in place in the defaultDir
        // using the file from Resources. However, the user may have replaced it later with
        // something else, so we need to avoid overwriting that. By the same token, if we
        // are doing work on or updating the Mermaid renderer support, we need to replace
        // it if that exists.
        // TODO: Tighten up the logic
        guard let source = Bundle.main.resourceURL?.appendingPathComponent(mermaidFilename) else {
            logger.warning("Resource URL was not found.")
            return
        }
        let destination = defaultDir.appendingPathComponent(mermaidFilename)

        guard FileManager.default.fileExists(atPath: source.path(percentEncoded: false)) else {
            logger.warning("Bundled renderer not found: \(mermaidFilename) — skipping")
            return
        }

        do {
            if FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)) {
                try FileManager.default.removeItem(at: destination)
            }
            try FileManager.default.copyItem(at: source, to: destination)
            logger.info("Copied bundled renderer: \(mermaidFilename)")
        } catch {
            logger.error("Failed to copy renderer \(mermaidFilename): \(error.localizedDescription)")
        }
    }
    
    func add(_ renderer: RendererConfigEntry) {
        if let index = renderers.firstIndex(where: {existing in renderer.name == existing.name}) {
            renderers[index] = renderer
        }
    }
    
    func delete(_ renderer: RendererConfigEntry) {
        if let index = renderers.firstIndex(where: {existing in renderer.name == existing.name}) {
            renderers.remove(at: index)
        }
    }
    
}
