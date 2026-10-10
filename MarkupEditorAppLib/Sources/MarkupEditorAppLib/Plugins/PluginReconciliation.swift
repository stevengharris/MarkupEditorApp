//
//  PluginReconciliation.swift
//  MarkupEditorAppLib
//

import Foundation
import MarkupEditor

/// Compares the plugins recorded in Settings with the ones the editor reports as registered
/// once its plugin files have loaded. The editor looks a plugin up by exact name, so a
/// difference here is a plugin that will silently fail to run.
public enum PluginReconciliation {

    public enum Problem: Equatable, Sendable, CustomStringConvertible {
        /// Recorded in Settings, but the editor has no registered plugin of that kind and name.
        case notRegistered(name: String, kind: String, registered: [String])
        /// Registered with the editor, but not recorded in Settings.
        case unrecorded(name: String, kind: String)
        /// An exporter whose recorded extension differs from the one it registers.
        case extensionMismatch(name: String, recorded: String?, registered: String?)

        public var description: String {
            switch self {
            case .notRegistered(let name, let kind, let registered):
                let names = registered.isEmpty ? "none" : registered.joined(separator: ", ")
                return "\(kind) '\(name)' is in Settings but the editor has no such registered plugin (registered \(kind)s: \(names))"
            case .unrecorded(let name, let kind):
                return "\(kind) '\(name)' is registered with the editor but is not in Settings"
            case .extensionMismatch(let name, let recorded, let registered):
                switch (recorded, registered) {
                case (let recorded?, nil): return "exporter '\(name)' has extension '\(recorded)' in Settings but registers none"
                case (nil, let registered?): return "exporter '\(name)' registers extension '\(registered)' but has none in Settings"
                case (let recorded?, let registered?): return "exporter '\(name)' has extension '\(recorded)' in Settings but registers '\(registered)'"
                case (nil, nil): return "exporter '\(name)' has a mismatched extension"
                }
            }
        }
    }

    /// - Parameter registered: the manifests the editor reports for its registered plugins, as
    ///   received by `markupPluginsDidLoad` (`name`, `type`, and `ext` for an exporter).
    /// Plugins with no backing file (the built-in exporters) and the internal codeviews, which
    /// load but never register, are not expected to be registered.
    public static func problems(recordedExporters: [Plugin], recordedCodeViews: [Plugin], registered: [[String: String]]) -> [Problem] {
        struct Entry {
            let name: String
            let kind: String
            let ext: String?
        }
        let entries = registered.compactMap { manifest -> Entry? in
            guard let name = manifest["name"], let kind = manifest["type"], kind == "exporter" || kind == "codeview" else { return nil }
            return Entry(name: name, kind: kind, ext: manifest["ext"])
        }
        func registeredNames(_ kind: String) -> [String] {
            entries.filter { $0.kind == kind }.map(\.name)
        }

        let recordedByKind = [("exporter", recordedExporters), ("codeview", recordedCodeViews)]
        var problems: [Problem] = []
        for (kind, recorded) in recordedByKind {
            for plugin in recorded where plugin.filename != nil {
                if kind == "codeview", CodeViewManager.protectedNames.contains(plugin.name) { continue }
                guard let entry = entries.first(where: { $0.kind == kind && $0.name == plugin.name }) else {
                    problems.append(.notRegistered(name: plugin.name, kind: kind, registered: registeredNames(kind)))
                    continue
                }
                if kind == "exporter", entry.ext != plugin.ext {
                    problems.append(.extensionMismatch(name: plugin.name, recorded: plugin.ext, registered: entry.ext))
                }
            }
        }
        for entry in entries {
            let recorded = entry.kind == "exporter" ? recordedExporters : recordedCodeViews
            if !recorded.contains(where: { $0.name == entry.name }) {
                problems.append(.unrecorded(name: entry.name, kind: entry.kind))
            }
        }
        return problems
    }
}
