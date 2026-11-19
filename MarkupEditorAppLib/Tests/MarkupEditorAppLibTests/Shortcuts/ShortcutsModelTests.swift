//
//  ShortcutsModelTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

@MainActor
struct ShortcutsModelTests {

    private let library = ShortcutLibrary(
        unfiled: [ShortcutEntry(name: "Alpha", identifier: "1")],
        folders: [ShortcutFolder(name: "Work", identifier: "F", shortcuts: [ShortcutEntry(name: "Beta", identifier: "2")])])

    private func scratch(answers: @escaping @Sendable ([String]) throws -> String) -> (model: ShortcutsModel, store: ChosenShortcutsStore, cleanup: () -> Void) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutsModelTests-\(UUID().uuidString)")
        let store = ChosenShortcutsStore(directory: root.appendingPathComponent("shortcuts"))
        let model = ShortcutsModel(reader: ShortcutLibraryReader { try answers($0) }, store: store)
        return (model, store, { try? FileManager.default.removeItem(at: root) })
    }

    private nonisolated static let uuid1 = "11111111-1111-1111-1111-111111111111"
    private nonisolated static let folder = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"

    private nonisolated static func answers(_ arguments: [String]) throws -> String {
        switch arguments {
        case ["list", "--folder-name", "none", "--show-identifiers"]: return "Alpha (\(uuid1))\n"
        case ["list", "--folders", "--show-identifiers"]: return "Work (\(folder))\n"
        default: return "Beta (22222222-2222-2222-2222-222222222222)\n"
        }
    }

    @Test func itStartsWithTheStoredChoicesAndNoLibrary() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutsModelTests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ChosenShortcutsStore(directory: root)
        try store.add("Alpha")
        let model = ShortcutsModel(reader: ShortcutLibraryReader { _ in "" }, store: store)
        #expect(model.chosen == ["Alpha"])
        #expect(model.library == nil)
    }

    @Test func loadingTheLibraryFillsItAndClearsTheError() async {
        let (model, _, cleanup) = scratch(answers: Self.answers)
        defer { cleanup() }
        await model.reloadLibrary()
        #expect(model.library?.allNames == ["Alpha", "Beta"])
        #expect(model.errorMessage == nil)
        #expect(!model.isLoading)
    }

    @Test func aFailureKeepsTheLastLibraryAndShowsTheError() async {
        let flag = Flag()
        let (model, _, cleanup) = scratch(answers: { arguments in
            if flag.failing { throw ShortcutsError.timedOut }
            return try Self.answers(arguments)
        })
        defer { cleanup() }
        await model.reloadLibrary()
        flag.failing = true
        await model.reloadLibrary()
        #expect(model.library?.allNames == ["Alpha", "Beta"])
        #expect(model.errorMessage == ShortcutsError.timedOut.errorDescription)
    }

    private final class Flag: @unchecked Sendable { var failing = false }

    @Test func choosingAndRemovingUpdateTheListAndTheStore() throws {
        let (model, store, cleanup) = scratch(answers: Self.answers)
        defer { cleanup() }
        model.choose("Alpha")
        model.choose("Beta")
        #expect(model.chosen == ["Alpha", "Beta"])
        #expect(store.load() == ["Alpha", "Beta"])
        #expect(model.isChosen("Alpha"))
        model.remove("Alpha")
        #expect(model.chosen == ["Beta"])
        #expect(!model.isChosen("Alpha"))
    }

    @Test func aChoiceMissingFromTheLibraryIsMissingOnlyOnceTheLibraryIsKnown() async {
        let (model, _, cleanup) = scratch(answers: Self.answers)
        defer { cleanup() }
        model.choose("Gone")
        model.choose("Beta")
        #expect(!model.isMissing("Gone"))
        await model.reloadLibrary()
        #expect(model.isMissing("Gone"))
        #expect(!model.isMissing("Beta"))
    }

    @Test func theChosenListFollowsChangesMadeByAnotherStoreInstance() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutsModelTests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let store = ChosenShortcutsStore(directory: root)
        let model = ShortcutsModel(reader: ShortcutLibraryReader { _ in "" }, store: store)
        try ChosenShortcutsStore(directory: root).add("Later")
        #expect(model.chosen.isEmpty)
        model.reloadChosen()
        #expect(model.chosen == ["Later"])
    }
}
