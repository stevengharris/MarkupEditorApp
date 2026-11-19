//
//  ChosenShortcutsStore.swift
//  MarkupEditorAppLib
//

import Foundation

public enum ChosenShortcutsError: LocalizedError, Equatable {
    case emptyName

    public var errorDescription: String? {
        switch self {
        case .emptyName: "A Shortcut needs a name."
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

    /// The chosen names, or none when the file is missing, empty or unreadable. An unreadable file is left
    /// as it is until the next write replaces it.
    public func load() -> [String] {
        guard let data = try? Data(contentsOf: fileURL), !data.isEmpty else { return [] }
        do {
            return try JSONDecoder().decode([String].self, from: data)
        } catch {
            EditLog.record(.warning, "Ignoring the chosen Shortcuts file: \(error.localizedDescription)", category: "Shortcuts", once: "shortcuts:unreadable:\(fileURL.path)")
            return []
        }
    }

    /// Adds `name` at the end. Returns false, and changes nothing, when it is already chosen.
    @discardableResult
    public func add(_ name: String) throws -> Bool {
        guard !name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { throw ChosenShortcutsError.emptyName }
        var names = load()
        guard !names.contains(name) else { return false }
        names.append(name)
        try write(names)
        return true
    }

    public func remove(_ name: String) throws {
        var names = load()
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
