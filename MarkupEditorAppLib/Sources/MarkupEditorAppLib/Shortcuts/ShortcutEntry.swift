//
//  ShortcutEntry.swift
//  MarkupEditorAppLib
//

import Foundation

/// A Shortcut as `shortcuts list --show-identifiers` reports it.
public struct ShortcutEntry: Equatable, Hashable, Identifiable, Sendable {
    public let name: String
    public let identifier: String
    public var id: String { identifier }

    public init(name: String, identifier: String) {
        self.name = name
        self.identifier = identifier
    }
}

/// A folder of Shortcuts, in the order the Shortcuts app lists them.
public struct ShortcutFolder: Equatable, Hashable, Identifiable, Sendable {
    public let name: String
    public let identifier: String
    public let shortcuts: [ShortcutEntry]
    public var id: String { identifier }

    public init(name: String, identifier: String, shortcuts: [ShortcutEntry]) {
        self.name = name
        self.identifier = identifier
        self.shortcuts = shortcuts
    }
}

/// Every Shortcut the user has: those in no folder first, then each folder.
public struct ShortcutLibrary: Equatable, Sendable {
    public let unfiled: [ShortcutEntry]
    public let folders: [ShortcutFolder]

    public init(unfiled: [ShortcutEntry], folders: [ShortcutFolder]) {
        self.unfiled = unfiled
        self.folders = folders
    }

    public var isEmpty: Bool { unfiled.isEmpty && folders.allSatisfy { $0.shortcuts.isEmpty } }

    public var allNames: [String] { unfiled.map(\.name) + folders.flatMap { $0.shortcuts.map(\.name) } }

    public func contains(name: String) -> Bool {
        allNames.contains(name)
    }
}
