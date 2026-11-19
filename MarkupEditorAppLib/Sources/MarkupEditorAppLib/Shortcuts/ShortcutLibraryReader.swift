//
//  ShortcutLibraryReader.swift
//  MarkupEditorAppLib
//

import Foundation

/// Reads the user's Shortcuts the way the Shortcuts app shows them: those in no folder, then each folder.
public struct ShortcutLibraryReader: Sendable {

    public typealias Run = @Sendable (_ arguments: [String]) async throws -> String

    private let run: Run

    /// - Parameter run: Runs `shortcuts` with the given arguments and returns its output. Replaced in tests.
    public init(run: @escaping Run = { try await ShortcutsProcess.run(arguments: $0) }) {
        self.run = run
    }

    public func read() async throws -> ShortcutLibrary {
        let unfiled = ShortcutListParser.entries(from: try await run(["list", "--folder-name", "none", "--show-identifiers"]))
        let folderEntries = ShortcutListParser.entries(from: try await run(["list", "--folders", "--show-identifiers"]))
        var folders: [ShortcutFolder] = []
        for folder in folderEntries {
            let shortcuts = ShortcutListParser.entries(from: try await run(["list", "--folder-name", folder.identifier, "--show-identifiers"]))
            folders.append(ShortcutFolder(name: folder.name, identifier: folder.identifier, shortcuts: shortcuts))
        }
        return ShortcutLibrary(unfiled: unfiled, folders: folders)
    }
}
