//
//  ChosenShortcutsStore.swift
//  MarkupEditorAppLib
//

import Foundation

public enum ChosenShortcutsError: LocalizedError, Equatable {
    case emptyName
    /// The saved list exists but could not be read, so it was left as it is.
    case unreadable(String)

    public var errorDescription: String? {
        switch self {
        case .emptyName: "A Shortcut needs a name."
        case .unreadable(let reason): "The list of chosen Shortcuts could not be read, so it was not changed: \(reason)"
        }
    }
}

/// The names of the Shortcuts the user has chosen to run from the menu, in the order chosen, kept as one JSON file.
public struct ChosenShortcutsStore: Sendable {
    public let directory: URL

    public init(directory: URL) {
        self.directory = directory
    }

    public static var standard: ChosenShortcutsStore {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return ChosenShortcutsStore(directory: support.appendingPathComponent("shortcuts"))
    }

    private var fileURL: URL { directory.appendingPathComponent("chosen.json") }

    /// The chosen names, or none when the file is missing, empty, cannot be read or is not valid. The file is
    /// not touched; `add` and `remove` refuse to write over one that exists but cannot be read, and replace
    /// one that can be read but is not valid.
    public func load() -> [String] {
        do {
            return try read()
        } catch {
            EditLog.record(.warning, "Ignoring the chosen Shortcuts file: \(error.localizedDescription)", category: "Shortcuts", once: "shortcuts:unreadable:\(fileURL.path)")
            return []
        }
    }

    /// The names in the file: none when it is missing, empty or not valid JSON. Throws when it exists and
    /// cannot be read, so a caller about to rewrite it does not replace names it failed to see.
    private func read() throws -> [String] {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return [] }
        let data: Data
        do {
            data = try Data(contentsOf: fileURL)
        } catch {
            throw ChosenShortcutsError.unreadable(error.localizedDescription)
        }
        guard !data.isEmpty else { return [] }
        return (try? JSONDecoder().decode([String].self, from: data)) ?? []
    }

    /// Adds `name` at the end. Returns false, and changes nothing, when it is already chosen.
    @discardableResult
    public func add(_ name: String) throws -> Bool {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ChosenShortcutsError.emptyName }
        var names = try read()
        guard !names.contains(name) else { return false }
        names.append(name)
        try write(names)
        return true
    }

    public func remove(_ name: String) throws {
        var names = try read()
        guard names.contains(name) else { return }
        names.removeAll { $0 == name }
        try write(names)
    }

    private func write(_ names: [String]) throws {
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted]
        try encoder.encode(names).write(to: fileURL, options: .atomic)
        NotificationCenter.default.post(name: .chosenShortcutsDidChange, object: nil, userInfo: ["directory": directory.path])
    }
}
