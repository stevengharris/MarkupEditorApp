//
//  InstalledExporter.swift
//  MarkupEditorAppLib
//

import Foundation
import MarkupEditor

/// An exporter plugin that is installed from a JavaScript file: the plugins `markup export` can run beyond the
/// built-in HTML and PDF.
public struct InstalledExporter: Codable, Equatable, Sendable {
    public let name: String
    public let ext: String
    public let filename: String

    public init(name: String, ext: String, filename: String) {
        self.name = name
        self.ext = ext
        self.filename = filename
    }

    /// The exporters among `exporters` that have a file and a default extension.
    public static func installed(from exporters: [Plugin]) -> [InstalledExporter] {
        exporters.compactMap { plugin in
            guard let filename = plugin.filename, let ext = plugin.ext, !ext.isEmpty else { return nil }
            return InstalledExporter(name: plugin.name, ext: ext, filename: filename)
        }
    }

    /// The exporter whose name matches `query`, else the one whose extension does, ignoring case and a leading dot.
    public static func find(_ query: String, in installed: [InstalledExporter]) -> InstalledExporter? {
        let wanted = query.lowercased()
        guard !wanted.isEmpty else { return nil }
        let extensionWanted = wanted.hasPrefix(".") ? String(wanted.dropFirst()) : wanted
        return installed.first { $0.name.lowercased() == wanted }
            ?? installed.first { $0.ext.lowercased() == extensionWanted }
    }

    /// What to say when `query` names no installed exporter, including what is available.
    public static func notInstalledMessage(_ query: String, installed: [InstalledExporter]) -> String {
        let formats = ["html", "pdf"] + installed.map(\.name)
        return "No exporter named '\(query)' is installed. Available formats: \(formats.joined(separator: ", "))."
    }
}
