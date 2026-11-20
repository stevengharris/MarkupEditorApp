//
//  CurrentDocumentPublisherTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
import AppKit
import MarkupEditorAppLib
@testable import MarkupEditorApp

@MainActor @Suite(.serialized) struct CurrentDocumentPublisherTests {

    private struct Rig {
        let publisher: CurrentDocumentPublisher
        let file: CurrentDocumentFile
        let center: NotificationCenter
        let cleanup: () -> Void
    }

    private static let pid: Int32 = 4242

    private func rig() -> Rig {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("CurrentDocumentPublisherTests-\(UUID().uuidString)")
        let file = CurrentDocumentFile(url: root.appendingPathComponent(CurrentDocumentFile.fileName))
        let center = NotificationCenter()
        let publisher = CurrentDocumentPublisher(file: file, pid: Self.pid, center: center)
        return Rig(publisher: publisher, file: file, center: center, cleanup: { try? FileManager.default.removeItem(at: root) })
    }

    private func document(_ path: String?, changes: Bool = false) -> MarkupDocument {
        let document = MarkupDocument()
        document.url = path.map { URL(fileURLWithPath: $0) }
        document.hasChanges = changes
        return document
    }

    /// Waits up to two seconds for `condition`, since an observed change is published after a hop to the main actor.
    private func eventually(_ condition: () -> Bool) async -> Bool {
        for _ in 0..<200 {
            if condition() { return true }
            try? await Task.sleep(for: .milliseconds(10))
        }
        return condition()
    }

    @Test func testAttachingADocumentPublishesItAtOnce() {
        let rig = rig()
        defer { rig.cleanup() }
        rig.publisher.attach(document("/tmp/a.md", changes: true))
        let state = rig.file.load()
        #expect(state?.path == "/tmp/a.md")
        #expect(state?.modified == true)
        #expect(state?.pid == Self.pid)
    }

    @Test func testAnUntitledDocumentPublishesANullPath() {
        let rig = rig()
        defer { rig.cleanup() }
        rig.publisher.attach(document(nil))
        #expect(rig.file.load() != nil)
        #expect(rig.file.load()?.path == nil)
    }

    @Test func testEditingTheDocumentRewritesTheModifiedFlag() async {
        let rig = rig()
        defer { rig.cleanup() }
        let doc = document("/tmp/a.md")
        rig.publisher.attach(doc)
        doc.hasChanges = true
        #expect(await eventually { rig.file.load()?.modified == true })
        doc.hasChanges = false
        #expect(await eventually { rig.file.load()?.modified == false })
    }

    @Test func testChangingTheURLRewritesThePath() async {
        let rig = rig()
        defer { rig.cleanup() }
        let doc = document(nil)
        rig.publisher.attach(doc)
        doc.url = URL(fileURLWithPath: "/tmp/saved.md")
        #expect(await eventually { rig.file.load()?.path == "/tmp/saved.md" })
        doc.url = nil
        #expect(await eventually { rig.file.load()?.path == nil })
    }

    @Test func testAttachingAnotherDocumentFollowsItAndLeavesTheFirstAlone() async {
        let rig = rig()
        defer { rig.cleanup() }
        let first = document("/tmp/a.md")
        let second = document("/tmp/b.md")
        rig.publisher.attach(first)
        rig.publisher.attach(second)
        #expect(rig.file.load()?.path == "/tmp/b.md")
        first.hasChanges = true
        first.url = URL(fileURLWithPath: "/tmp/elsewhere.md")
        try? await Task.sleep(for: .milliseconds(150))
        #expect(rig.file.load()?.path == "/tmp/b.md")
        #expect(rig.file.load()?.modified == false)
        second.hasChanges = true
        #expect(await eventually { rig.file.load()?.modified == true })
    }

    @Test func testAttachingTheSameDocumentAgainDoesNotMultiplyWrites() async {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("CurrentDocumentPublisherTests-\(UUID().uuidString)")
        defer { try? FileManager.default.removeItem(at: root) }
        let file = CurrentDocumentFile(url: root.appendingPathComponent(CurrentDocumentFile.fileName))
        let counter = Counter()
        let publisher = CurrentDocumentPublisher(file: file, pid: Self.pid, now: { counter.count += 1; return Date() }, center: NotificationCenter())
        let doc = document("/tmp/a.md")
        publisher.attach(doc)
        publisher.attach(doc)
        publisher.attach(doc)
        let before = counter.count
        doc.hasChanges = true
        #expect(await eventually { file.load()?.modified == true })
        try? await Task.sleep(for: .milliseconds(150))
        #expect(counter.count == before + 1)
    }

    private final class Counter: @unchecked Sendable { var count = 0 }

    @Test func testBecomingActiveRewritesAFileThatWasRemoved() {
        let rig = rig()
        defer { rig.cleanup() }
        rig.publisher.attach(document("/tmp/a.md"))
        rig.file.remove()
        rig.center.post(name: NSApplication.didBecomeActiveNotification, object: nil)
        #expect(rig.file.load()?.path == "/tmp/a.md")
    }

    @Test func testBecomingActiveWithNoDocumentWritesNothing() {
        let rig = rig()
        defer { rig.cleanup() }
        rig.center.post(name: NSApplication.didBecomeActiveNotification, object: nil)
        #expect(rig.file.load() == nil)
    }

    @Test func testQuittingRemovesTheFile() {
        let rig = rig()
        defer { rig.cleanup() }
        rig.publisher.attach(document("/tmp/a.md"))
        rig.center.post(name: NSApplication.willTerminateNotification, object: nil)
        #expect(rig.file.load() == nil)
    }

    @Test func testQuittingLeavesAFileAnotherProcessWrote() throws {
        let rig = rig()
        defer { rig.cleanup() }
        rig.publisher.attach(document("/tmp/a.md"))
        try rig.file.write(CurrentDocumentState(path: "/tmp/theirs.md", modified: false, pid: Self.pid + 1, updated: Date()))
        rig.center.post(name: NSApplication.willTerminateNotification, object: nil)
        #expect(rig.file.load()?.path == "/tmp/theirs.md")
    }

    @Test func testNothingIsPublishedAfterQuitting() async {
        let rig = rig()
        defer { rig.cleanup() }
        let doc = document("/tmp/a.md")
        rig.publisher.attach(doc)
        rig.center.post(name: NSApplication.willTerminateNotification, object: nil)
        doc.hasChanges = true
        try? await Task.sleep(for: .milliseconds(150))
        #expect(rig.file.load() == nil)
    }
}
