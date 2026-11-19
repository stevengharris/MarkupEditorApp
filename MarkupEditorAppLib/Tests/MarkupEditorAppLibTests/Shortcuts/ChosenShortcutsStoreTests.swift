//
//  ChosenShortcutsStoreTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct ChosenShortcutsStoreTests {

    private func scratch() -> (store: ChosenShortcutsStore, directory: URL, cleanup: () -> Void) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ChosenShortcutsStoreTests-\(UUID().uuidString)")
        let directory = root.appendingPathComponent("shortcuts")
        return (ChosenShortcutsStore(directory: directory), directory, { try? FileManager.default.removeItem(at: root) })
    }

    @Test func aMissingFileIsNoShortcuts() {
        let (store, _, cleanup) = scratch()
        defer { cleanup() }
        #expect(store.load().isEmpty)
    }

    @Test func namesKeepTheOrderTheyWereChosenIn() throws {
        let (store, _, cleanup) = scratch()
        defer { cleanup() }
        try store.add("Publish")
        try store.add("Archive")
        try store.add("Open in Browser")
        #expect(store.load() == ["Publish", "Archive", "Open in Browser"])
    }

    @Test func anotherInstanceReadsWhatWasWritten() throws {
        let (store, directory, cleanup) = scratch()
        defer { cleanup() }
        try store.add("Publish")
        #expect(ChosenShortcutsStore(directory: directory).load() == ["Publish"])
    }

    @Test func choosingTheSameNameAgainChangesNothing() throws {
        let (store, _, cleanup) = scratch()
        defer { cleanup() }
        #expect(try store.add("Publish") == true)
        #expect(try store.add("Publish") == false)
        #expect(store.load() == ["Publish"])
    }

    @Test func namesDifferingOnlyInCaseAreDifferentNames() throws {
        let (store, _, cleanup) = scratch()
        defer { cleanup() }
        try store.add("Publish")
        try store.add("publish")
        #expect(store.load() == ["Publish", "publish"])
        try store.remove("Publish")
        #expect(store.load() == ["publish"])
    }

    @Test func aBlankNameIsRefused() {
        let (store, _, cleanup) = scratch()
        defer { cleanup() }
        #expect(throws: ChosenShortcutsError.emptyName) { try store.add("") }
        #expect(throws: ChosenShortcutsError.emptyName) { try store.add("  \n") }
        #expect(store.load().isEmpty)
    }

    @Test func removingTakesOutOnlyThatNameAndIsHarmlessWhenItIsNotThere() throws {
        let (store, _, cleanup) = scratch()
        defer { cleanup() }
        try store.add("A")
        try store.add("B")
        try store.remove("A")
        try store.remove("Nope")
        #expect(store.load() == ["B"])
    }

    @Test func anEmptyOrCorruptFileIsNoShortcutsAndTheNextWriteReplacesIt() throws {
        let (store, directory, cleanup) = scratch()
        defer { cleanup() }
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        let file = directory.appendingPathComponent("chosen.json")
        try Data().write(to: file)
        #expect(store.load().isEmpty)
        try Data("{ not json".utf8).write(to: file)
        #expect(store.load().isEmpty)
        try store.add("A")
        #expect(store.load() == ["A"])
    }

    @Test func everyChangePostsANotification() async throws {
        let (store, _, cleanup) = scratch()
        defer { cleanup() }
        let count = Counter()
        let mine = store.directory.path
        let token = NotificationCenter.default.addObserver(forName: .chosenShortcutsDidChange, object: nil, queue: nil) { note in
            if note.userInfo?["directory"] as? String == mine { count.value += 1 }
        }
        defer { NotificationCenter.default.removeObserver(token) }
        try store.add("A")
        try store.add("A")
        try store.remove("A")
        #expect(count.value == 2)
    }

    private final class Counter: @unchecked Sendable { var value = 0 }
}
