//
//  ShortcutsModel.swift
//  MarkupEditorAppLib
//

import Foundation
import Observation

/// The Shortcuts the user can choose from, and the ones chosen, as the Tools section and the menu show them.
@MainActor @Observable
public final class ShortcutsModel {

    /// The user's Shortcuts as last read; nil until a read has succeeded.
    public private(set) var library: ShortcutLibrary?
    public private(set) var chosen: [String]
    /// Why the last read of the library failed; nil after a read that worked.
    public private(set) var errorMessage: String?
    public private(set) var isLoading = false

    @ObservationIgnored private let reader: ShortcutLibraryReader
    @ObservationIgnored private let store: ChosenShortcutsStore

    public init(reader: ShortcutLibraryReader = ShortcutLibraryReader(), store: ChosenShortcutsStore = .standard) {
        self.reader = reader
        self.store = store
        chosen = store.load()
    }

    /// Reads the library again. A failed read keeps the library from the one before.
    public func reloadLibrary() async {
        isLoading = true
        defer { isLoading = false }
        do {
            library = try await reader.read()
            errorMessage = nil
        } catch {
            errorMessage = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }

    public func reloadChosen() {
        chosen = store.load()
    }

    public func isChosen(_ name: String) -> Bool {
        chosen.contains(name)
    }

    /// Whether a chosen Shortcut is gone from the library. False while the library is unknown.
    public func isMissing(_ name: String) -> Bool {
        guard let library else { return false }
        return !library.contains(name: name)
    }

    public func choose(_ name: String) {
        do { try store.add(name) } catch { errorMessage = error.localizedDescription }
        reloadChosen()
    }

    public func remove(_ name: String) {
        do { try store.remove(name) } catch { errorMessage = error.localizedDescription }
        reloadChosen()
    }
}
