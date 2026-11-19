//
//  CurrentDocumentResolverTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import AppKit
@testable import MarkupEditorAppLib

struct CurrentDocumentResolverTests {

    private func state(_ path: String?, modified: Bool = false, pid: Int32 = 100, version: Int = CurrentDocumentState.currentVersion) -> CurrentDocumentState {
        var state = CurrentDocumentState(path: path, modified: modified, pid: pid, updated: Date(timeIntervalSince1970: 1_800_000_000))
        state.version = version
        return state
    }

    private let running: @Sendable (Int32) -> Bool = { _ in true }
    private let exists: (String) -> Bool = { _ in true }
    private let notRunning: @Sendable (Int32) -> Bool = { _ in false }

    @Test func aSavedUnmodifiedDocumentGivesItsPath() {
        #expect(CurrentDocumentResolver.resolve(state("/a.md"), isRunning: running, fileExists: exists) == .saved(path: "/a.md"))
    }

    @Test func aModifiedDocumentGivesItsPathAndSaysSo() {
        #expect(CurrentDocumentResolver.resolve(state("/a.md", modified: true), isRunning: running, fileExists: exists) == .modified(path: "/a.md"))
    }

    @Test func anUntitledDocumentHasNoPath() {
        #expect(CurrentDocumentResolver.resolve(state(nil), isRunning: running) == .untitled)
        #expect(CurrentDocumentResolver.resolve(state(""), isRunning: running) == .untitled)
        #expect(CurrentDocumentResolver.resolve(state(nil, modified: true), isRunning: running) == .untitled)
    }

    @Test func noFileMeansTheAppIsNotRunning() {
        #expect(CurrentDocumentResolver.resolve(nil, isRunning: running) == .notRunning)
    }

    @Test func aFileFromADeadProcessMeansTheAppIsNotRunning() {
        #expect(CurrentDocumentResolver.resolve(state("/a.md"), isRunning: notRunning) == .notRunning)
    }

    @Test func theProcessCheckReceivesTheFilesPid() {
        let seen = Seen()
        _ = CurrentDocumentResolver.resolve(state("/a.md", pid: 4812), isRunning: { pid in seen.pids.append(pid); return true })
        #expect(seen.pids == [4812])
    }

    @Test func aFileFromAnotherVersionIsNotTrusted() {
        #expect(CurrentDocumentResolver.resolve(state("/a.md", version: 99), isRunning: running) == .notRunning)
    }

    @Test func aRefusedReadIsItsOwnResolutionAndOtherReadsFollowTheState() {
        #expect(CurrentDocumentResolver.resolve(.denied, isRunning: running) == .accessDenied)
        #expect(CurrentDocumentResolver.resolve(.missing, isRunning: running) == .notRunning)
        #expect(CurrentDocumentResolver.resolve(.unreadable, isRunning: running) == .notRunning)
        #expect(CurrentDocumentResolver.resolve(.state(state("/a.md")), isRunning: running, fileExists: exists) == .saved(path: "/a.md"))
    }

    @Test func aPathWhoseFileIsGoneIsTreatedAsNotYetSaved() {
        #expect(CurrentDocumentResolver.resolve(state("/a.md"), isRunning: running, fileExists: { _ in false }) == .untitled)
        #expect(CurrentDocumentResolver.resolve(state("/a.md", modified: true), isRunning: running, fileExists: { _ in false }) == .untitled)
    }

    @Test func theDefaultFileCheckLooksAtTheRealFileSystem() throws {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("resolver-\(UUID().uuidString).md")
        #expect(CurrentDocumentResolver.resolve(state(url.path), isRunning: running) == .untitled)
        try Data("x".utf8).write(to: url)
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(CurrentDocumentResolver.resolve(state(url.path), isRunning: running) == .saved(path: url.path))
    }

    @Test func aRunningProcessWithTheRightBundleIsMarkupEditorAndOtherwiseIsNot() throws {
        let finder = try #require(NSWorkspace.shared.runningApplications.first { $0.bundleIdentifier == "com.apple.finder" })
        #expect(CurrentDocumentResolver.isMarkupEditorRunning(pid: finder.processIdentifier, bundleIdentifier: "com.apple.finder"))
        #expect(!CurrentDocumentResolver.isMarkupEditorRunning(pid: finder.processIdentifier, bundleIdentifier: "com.stevengharris.MarkupEditorApp"))
    }

    @Test func thisProcessIsNotMarkupEditor() {
        #expect(!CurrentDocumentResolver.isMarkupEditorRunning(pid: ProcessInfo.processInfo.processIdentifier))
        #expect(!CurrentDocumentResolver.isMarkupEditorRunning(pid: 0))
    }

    private final class Seen: @unchecked Sendable { var pids: [Int32] = [] }
}
