//
//  PluginInstaller.swift
//  MarkupEditorAppLib
//

import Foundation
import OSLog
import MarkupEditor

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorAppLib", category: "PluginInstaller")

public enum PluginType: Sendable {
    case exporter
    case codeview
}

public enum PluginInstallError: Error, Equatable, Sendable {
    case missingExtension(String)
    case invalidSourceURL(String)
    case downloadFailed(String)
    case verificationFailed(String)
    case sourceNotFound(String)
    case copyFailed(filename: String, reason: String)
    case protectedName(String)
}

extension PluginInstallError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .missingExtension(let name):
            return "Plugin '\(name)' is an exporter but has no file extension."
        case .invalidSourceURL(let name):
            return "Plugin '\(name)' has an invalid source URL."
        case .downloadFailed(let name):
            return "Could not download plugin '\(name)'."
        case .verificationFailed(let name):
            return "Plugin '\(name)' did not install successfully."
        case .sourceNotFound(let filename):
            return "The file “\(filename)” could not be found."
        case .copyFailed(let filename, let reason):
            return "“\(filename)” could not be installed: \(reason)"
        case .protectedName(let name):
            return "“\(name)” is reserved for a built-in plugin."
        }
    }
}

/// Where a downloaded plugin file must be moved before ExporterManager/CodeViewManager's
/// add() can be called on it -- both derive the stored filename from the URL's last path
/// component, and a URLSession download's temp file has a random system name.
public func installDestination(for entry: PluginCatalogEntry, in directory: URL) -> URL {
    directory.appendingPathComponent(entry.filename)
}

/// Downloads entry.source, renames it to entry.filename, and installs it via the
/// existing ExporterManager/CodeViewManager. Verifies success via nameExists(_:)
/// rather than trusting add()'s return, since add() swallows every failure into a
/// logger and returns the list unchanged either way. Cleans up its temp directory on
/// every path. Returns the updated (exporters, codeViews) lists -- this package has no
/// `AppConfig` to write to, so the app-side caller reads the current lists in, and
/// writes the returned lists back after.
///
/// `download` is injected (defaulting to a real URLSession call) so the full
/// rename/add/verify sequence is testable against a canned local file, the same
/// fetch/decode-separation pattern PluginDiscoveryModel uses for fetchPluginCatalog.
///
/// `@MainActor`: takes/returns `[Plugin]`, which isn't provably `Sendable` across the module
/// boundary (see CodeViewManager's `mermaid` comment) -- pinning to the main actor avoids
/// treating every call site as an isolation-domain crossing, consistent with where this is
/// actually called from (a SwiftUI button action).
@MainActor
public func installPlugin(
    _ entry: PluginCatalogEntry,
    type: PluginType,
    exporters: [Plugin],
    codeViews: [Plugin],
    cacheDir: URL,
    download: @MainActor (URL) async throws -> (URL, URLResponse) = { try await URLSession.shared.download(from: $0) }
) async throws -> (exporters: [Plugin], codeViews: [Plugin]) {
    if type == .exporter, entry.ext == nil {
        throw PluginInstallError.missingExtension(entry.name)
    }
    guard let sourceURL = URL(string: entry.source) else {
        throw PluginInstallError.invalidSourceURL(entry.name)
    }

    let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
    defer { try? FileManager.default.removeItem(at: tempDir) }

    let downloadedURL: URL
    let response: URLResponse
    do {
        (downloadedURL, response) = try await download(sourceURL)
    } catch {
        logger.error("Failed to download \(entry.name) from \(sourceURL.absoluteString): \(error.localizedDescription)")
        throw PluginInstallError.downloadFailed(entry.name)
    }
    guard let httpResponse = response as? HTTPURLResponse, (200...299).contains(httpResponse.statusCode) else {
        logger.error("Download of \(entry.name) returned an unexpected response")
        throw PluginInstallError.downloadFailed(entry.name)
    }

    let destination = installDestination(for: entry, in: tempDir)
    try FileManager.default.moveItem(at: downloadedURL, to: destination)

    switch type {
    case .exporter:
        guard let ext = entry.ext else { throw PluginInstallError.missingExtension(entry.name) }
        let updatedExporters = ExporterManager.add(name: entry.name, url: destination, ext: ext, exporters: exporters, codeViews: codeViews, cacheDir: cacheDir)
        guard ExporterManager.nameExists(entry.name, in: updatedExporters) else {
            throw PluginInstallError.verificationFailed(entry.name)
        }
        logger.info("Installed \(entry.name)")
        return (updatedExporters, codeViews)
    case .codeview:
        let updatedCodeViews = CodeViewManager.add(name: entry.name, url: destination, exporters: exporters, codeViews: codeViews, cacheDir: cacheDir)
        guard CodeViewManager.nameExists(entry.name, in: updatedCodeViews) else {
            throw PluginInstallError.verificationFailed(entry.name)
        }
        logger.info("Installed \(entry.name)")
        return (exporters, updatedCodeViews)
    }
}
