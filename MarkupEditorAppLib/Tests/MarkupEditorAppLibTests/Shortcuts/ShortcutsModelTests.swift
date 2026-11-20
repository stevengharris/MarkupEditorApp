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

    private final class Gate: @unchecked Sendable {
        private let stream: AsyncStream<Void>
        private let continuation: AsyncStream<Void>.Continuation
        init() { (stream, continuation) = AsyncStream.makeStream() }
        func open() { continuation.yield(); continuation.finish() }
        func wait() async { for await _ in stream { return } }
    }

    private final class Counter: @unchecked Sendable {
        private let lock = NSLock()
        private var value = 0
        func next() -> Int { lock.lock(); defer { lock.unlock() }; value += 1; return value }
    }

    @Test func theNewestReloadWinsEvenWhenAnOlderOneFinishesLast() async {
        let started = Gate()
        let release = Gate()
        let counter = Counter()
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutsModelTests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let reader = ShortcutLibraryReader { arguments in
            guard arguments.contains("none") else { return "" }
            if counter.next() == 1 {
                started.open()
                await release.wait()
                return "Old (11111111-1111-1111-1111-111111111111)"
            }
            return "New (22222222-2222-2222-2222-222222222222)"
        }
        let model = ShortcutsModel(reader: reader, store: ChosenShortcutsStore(directory: root))
        let older = Task { await model.reloadLibrary() }
        await started.wait()
        await model.reloadLibrary()
        #expect(model.library?.allNames == ["New"])
        #expect(model.isLoading)
        release.open()
        await older.value
        #expect(model.library?.allNames == ["New"])
        #expect(!model.isLoading)
    }

    @Test func aFailedWriteIsReportedApartFromReadErrorsAndClearedByTheNextSuccess() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutsModelTests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let blocker = root.appendingPathComponent("blocker")
        try Data().write(to: blocker)
        let failing = ChosenShortcutsStore(directory: blocker.appendingPathComponent("shortcuts"))
        let model = ShortcutsModel(reader: ShortcutLibraryReader { _ in "" }, store: failing)
        model.choose("Alpha")
        #expect(model.chosen.isEmpty)
        #expect(model.chosenError != nil)
        #expect(model.errorMessage == nil)
        model.remove("Alpha")
        #expect(model.chosenError == nil)
    }

    @Test func aSuccessfulChoiceClearsAnEarlierWriteError() throws {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutsModelTests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let blocker = root.appendingPathComponent("blocker")
        try Data().write(to: blocker)
        let model = ShortcutsModel(reader: ShortcutLibraryReader { _ in "" },
                                   store: ChosenShortcutsStore(directory: blocker.appendingPathComponent("shortcuts")))
        model.choose("Alpha")
        #expect(model.chosenError != nil)
        try FileManager.default.removeItem(at: blocker)
        model.choose("Alpha")
        #expect(model.chosenError == nil)
        #expect(model.chosen == ["Alpha"])
    }
}
