//
//  PluginFileInstaller.swift
//  MarkupEditorAppLib
//

import Foundation

/// Copies a plugin file into an installed-plugins directory.
enum PluginFileInstaller {

    /// Copies `source` to `destination`. The copy is staged next to the destination and swapped
    /// in, so a failure leaves an installed file untouched instead of deleted. A source that is
    /// already the destination (the installed copy picked again) is left alone.
    static func install(source: URL, destination: URL) throws(PluginInstallError) {
        let fileManager = FileManager.default
        let filename = source.lastPathComponent
        guard fileManager.fileExists(atPath: source.path(percentEncoded: false)) else {
            throw .sourceNotFound(filename)
        }
        if source.resolvingSymlinksInPath().standardizedFileURL == destination.resolvingSymlinksInPath().standardizedFileURL {
            return
        }

        let staged = destination.deletingLastPathComponent()
            .appendingPathComponent(".\(UUID().uuidString)-\(destination.lastPathComponent)")
        do {
            try fileManager.copyItem(at: source, to: staged)
            if fileManager.fileExists(atPath: destination.path(percentEncoded: false)) {
                _ = try fileManager.replaceItemAt(destination, withItemAt: staged)
            } else {
                try fileManager.moveItem(at: staged, to: destination)
            }
        } catch {
            try? fileManager.removeItem(at: staged)
            throw .copyFailed(filename: filename, reason: error.localizedDescription)
        }
    }
}
