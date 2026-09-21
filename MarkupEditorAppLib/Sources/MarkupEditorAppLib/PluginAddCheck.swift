//
//  PluginAddCheck.swift
//  MarkupEditorAppLib
//

import Foundation
import MarkupEditor

public enum PluginAddError: Error, Equatable, LocalizedError {
    case wrongKind(expected: PluginBanner.Kind, found: PluginBanner.Kind)
    case protectedName(String)
    case nameInUse(String)
    case filenameInUse(String, plugin: String)

    public var errorDescription: String? {
        switch self {
        case .wrongKind(let expected, let found):
            "This file is \(found == .exporter ? "an" : "a") \(found.displayName), not \(expected == .exporter ? "an" : "a") \(expected.displayName). Use the add button for \(found.displayName)s."
        case .protectedName(let name):
            "“\(name)” is reserved for a built-in plugin."
        case .nameInUse(let name):
            "A plugin named “\(name)” is already installed from a different file. Delete it first to replace it."
        case .filenameInUse(let filename, let plugin):
            "The file “\(filename)” is already used by the plugin “\(plugin)”. Delete that plugin first to replace it."
        }
    }
}

/// Checks that a plugin whose banner has been read can be added next to the installed ones.
public enum PluginAddCheck {

    /// - Parameters:
    ///   - filename: the last path component of the file being added, which becomes the
    ///     installed file's name.
    ///   - expected: the kind the user asked to add, or nil to accept either.
    /// Adding the same name from the same file again is allowed: it replaces the installed copy.
    public static func validate(_ banner: PluginBanner, filename: String, expected: PluginBanner.Kind?, exporters: [Plugin], codeViews: [Plugin]) throws(PluginAddError) {
        if let expected, banner.kind != expected {
            throw .wrongKind(expected: expected, found: banner.kind)
        }
        if CodeViewManager.protectedNames.contains(banner.name) {
            throw .protectedName(banner.name)
        }
        let installed = exporters + codeViews
        // Names are compared exactly, since the editor's plugin registry is; filenames are
        // compared ignoring case, since the volume they are installed on does.
        func isSameFile(_ other: String?) -> Bool {
            other?.caseInsensitiveCompare(filename) == .orderedSame
        }
        // The registry is keyed by name across both kinds, so a second plugin under an existing
        // name would silently replace the first. A plugin with no file (a built-in
        // exporter) can't be deleted to make room.
        if let clash = installed.first(where: { $0.name == banner.name && !($0.type == banner.kind.rawValue && isSameFile($0.filename)) }) {
            throw clash.filename == nil ? .protectedName(banner.name) : .nameInUse(banner.name)
        }
        // Installing copies the file over any installed file of the same name.
        if let other = installed.first(where: { $0.name != banner.name && isSameFile($0.filename) }) {
            throw .filenameInUse(filename, plugin: other.name)
        }
    }
}
