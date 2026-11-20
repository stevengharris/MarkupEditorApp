//
//  ShortcutLibraryReader.swift
//  MarkupEditorAppLib
//

import Foundation

/// Reads the user's Shortcuts the way the Shortcuts app shows them: those in no folder, then each folder.
public struct ShortcutLibraryReader: Sendable {

    public typealias Run = @Sendable (_ arguments: [String]) async throws -> String

    private let run: Run
    private let timeout: Duration

    /// - Parameters:
    ///   - timeout: How long a whole read may take, however many folders there are.
    ///   - run: Runs `shortcuts` with the given arguments and returns its output. Replaced in tests.
    public init(timeout: Duration = .seconds(15), run: @escaping Run = { try await ShortcutsProcess.run(arguments: $0) }) {
        self.timeout = timeout
        self.run = run
    }

    /// Reads the library. Throws `ShortcutsError.timedOut` when the read takes longer than the limit, and
    /// `CancellationError` when the calling task is cancelled; either way the running command is stopped.
    public func read() async throws -> ShortcutLibrary {
        let limit = timeout
        return try await withThrowingTaskGroup(of: ShortcutLibrary?.self) { group in
            group.addTask { try await readAll() }
            group.addTask {
                try await Task.sleep(for: limit)
                return nil
            }
            defer { group.cancelAll() }
            guard let first = try await group.next(), let library = first else { throw ShortcutsError.timedOut }
            return library
        }
    }

    private func readAll() async throws -> ShortcutLibrary {
        try Task.checkCancellation()
        let unfiled = ShortcutListParser.entries(from: try await run(["list", "--folder-name", "none", "--show-identifiers"]))
        try Task.checkCancellation()
        let folderEntries = ShortcutListParser.entries(from: try await run(["list", "--folders", "--show-identifiers"]))
        var folders: [ShortcutFolder] = []
        for folder in folderEntries {
            try Task.checkCancellation()
            let shortcuts = ShortcutListParser.entries(from: try await run(["list", "--folder-name", folder.identifier, "--show-identifiers"]))
            folders.append(ShortcutFolder(name: folder.name, identifier: folder.identifier, shortcuts: shortcuts))
        }
        return ShortcutLibrary(unfiled: unfiled, folders: folders)
    }
}
