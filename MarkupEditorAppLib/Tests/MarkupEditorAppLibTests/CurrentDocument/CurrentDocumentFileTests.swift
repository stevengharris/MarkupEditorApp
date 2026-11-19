//
//  CurrentDocumentFileTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct CurrentDocumentFileTests {

    private func scratch() throws -> (file: CurrentDocumentFile, root: URL, cleanup: () -> Void) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("CurrentDocumentFileTests-\(UUID().uuidString)")
        let file = CurrentDocumentFile(url: root.appendingPathComponent("tmp").appendingPathComponent(CurrentDocumentFile.fileName))
        return (file, root, { try? FileManager.default.removeItem(at: root) })
    }

    private func state(_ path: String?, modified: Bool = false, pid: Int32 = 100) -> CurrentDocumentState {
        CurrentDocumentState(path: path, modified: modified, pid: pid, updated: Date(timeIntervalSince1970: 1_800_000_000))
    }

    @Test func theLocationMatchesTheControlSocketsFolder() {
        let home = "/Users/me/Library/Containers/com.stevengharris.MarkupEditorApp/Data"
        #expect(CurrentDocumentFile.url(containerHome: home).path == "\(home)/tmp/current-document.json")
        #expect(CurrentDocumentFile.defaultURL(home: "/Users/me").path == "\(home)/tmp/current-document.json")
        #expect(CurrentDocumentFile.url(containerHome: home).deletingLastPathComponent().path
                == URL(fileURLWithPath: ControlClient.appPath(containerHome: home)).deletingLastPathComponent().path)
    }

    @Test func writingCreatesTheFolderAndLoadingReadsItBack() throws {
        let (file, _, cleanup) = try scratch()
        defer { cleanup() }
        try file.write(state("/Users/me/post.md", modified: true))
        #expect(file.load() == state("/Users/me/post.md", modified: true))
    }

    @Test func aLaterWriteReplacesTheEarlierOne() throws {
        let (file, _, cleanup) = try scratch()
        defer { cleanup() }
        try file.write(state("/a.md"))
        try file.write(state("/b.md", pid: 200))
        #expect(file.load()?.path == "/b.md")
        #expect(file.load()?.pid == 200)
    }

    @Test func writingLeavesOnlyTheStateFile() throws {
        let (file, _, cleanup) = try scratch()
        defer { cleanup() }
        try file.write(state("/a.md"))
        try file.write(state("/b.md"))
        let names = try FileManager.default.contentsOfDirectory(atPath: file.url.deletingLastPathComponent().path)
        #expect(names == [CurrentDocumentFile.fileName])
    }

    @Test func aMissingEmptyOrCorruptFileLoadsAsNil() throws {
        let (file, _, cleanup) = try scratch()
        defer { cleanup() }
        #expect(file.load() == nil)
        try FileManager.default.createDirectory(at: file.url.deletingLastPathComponent(), withIntermediateDirectories: true)
        try Data().write(to: file.url)
        #expect(file.load() == nil)
        try Data("{ not json".utf8).write(to: file.url)
        #expect(file.load() == nil)
    }

    @Test func removingDeletesTheFileAndIsHarmlessWhenItIsGone() throws {
        let (file, _, cleanup) = try scratch()
        defer { cleanup() }
        try file.write(state("/a.md"))
        file.remove()
        #expect(file.load() == nil)
        #expect(!FileManager.default.fileExists(atPath: file.url.path))
        file.remove()
    }

    @Test func readingTellsAMissingFileFromAnUnreadableOneAndAPermissionRefusal() throws {
        let (file, _, cleanup) = try scratch()
        defer { cleanup() }
        #expect(file.read() == .missing)
        try file.write(state("/a.md"))
        #expect(file.read() == .state(state("/a.md")))
        try Data("{ not json".utf8).write(to: file.url)
        #expect(file.read() == .unreadable)
        try file.write(state("/a.md"))
        try FileManager.default.setAttributes([.posixPermissions: 0], ofItemAtPath: file.url.path)
        defer { try? FileManager.default.setAttributes([.posixPermissions: 0o600], ofItemAtPath: file.url.path) }
        #expect(file.read() == .denied)
    }

    @Test func theSystemsPermissionRefusalsAreRecognisedAndOtherErrorsAreNot() {
        func underlying(_ code: Int32) -> NSError {
            NSError(domain: NSCocoaErrorDomain, code: NSFileReadUnknownError,
                    userInfo: [NSUnderlyingErrorKey: NSError(domain: NSPOSIXErrorDomain, code: Int(code))])
        }
        #expect(CurrentDocumentFile.isPermissionRefusal(underlying(EPERM)))
        #expect(CurrentDocumentFile.isPermissionRefusal(underlying(EACCES)))
        #expect(CurrentDocumentFile.isPermissionRefusal(NSError(domain: NSCocoaErrorDomain, code: NSFileReadNoPermissionError)))
        #expect(!CurrentDocumentFile.isPermissionRefusal(underlying(ENOENT)))
        #expect(!CurrentDocumentFile.isPermissionRefusal(NSError(domain: NSCocoaErrorDomain, code: NSFileReadUnknownError)))
    }
}
