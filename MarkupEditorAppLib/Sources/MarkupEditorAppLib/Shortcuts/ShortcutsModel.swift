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
    /// The model the menu and the Tools section share, so both show the same library and neither reads it twice.
    public static let shared = ShortcutsModel()

    public private(set) var library: ShortcutLibrary?
    public private(set) var chosen: [String]
    /// Why the last read of the library failed; nil after a read that worked.
    public private(set) var errorMessage: String?
    /// Why the last change to the chosen list could not be saved; nil after one that worked.
    public private(set) var chosenError: String?
    /// Whether any read of the library is still going.
    public var isLoading: Bool { loadsInFlight > 0 }
    private var loadsInFlight = 0
    @ObservationIgnored private var latestLoad = 0

    @ObservationIgnored private let reader: ShortcutLibraryReader
    @ObservationIgnored private let store: ChosenShortcutsStore

    public init(reader: ShortcutLibraryReader = ShortcutLibraryReader(), store: ChosenShortcutsStore = .standard) {
        self.reader = reader
        self.store = store
        chosen = store.load()
    }

    /// Reads the library again. A failed read keeps the library from the one before. When reads overlap, only
    /// the one started last changes the model, so an older read that finishes late cannot replace newer data.
    public func reloadLibrary() async {
        latestLoad += 1
        let mine = latestLoad
        loadsInFlight += 1
        defer { loadsInFlight -= 1 }
        do {
            let result = try await reader.read()
            guard mine == latestLoad else { return }
            library = result
            errorMessage = nil
        } catch {
            guard mine == latestLoad else { return }
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
        change { try store.add(name) }
    }

    public func remove(_ name: String) {
        change { try store.remove(name) }
    }

    /// Applies a change to the stored list, then reloads it. A failure is logged and kept in `chosenError`.
    private func change(_ apply: () throws -> Void) {
        do {
            try apply()
            chosenError = nil
        } catch {
            chosenError = error.localizedDescription
            EditLog.shared.warning("The chosen Shortcuts could not be saved: \(error.localizedDescription)", category: "Shortcuts")
        }
        reloadChosen()
    }
}
