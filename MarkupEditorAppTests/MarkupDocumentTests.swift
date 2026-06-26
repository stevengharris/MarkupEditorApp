//
//  MarkupDocumentTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
@testable import MarkupEditorApp

// MARK: - Helpers

private func makeTempDir(suffix: String = "") throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + suffix)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

private func makeMetadata(_ key: String = "title", _ value: String = "Test") -> MetadataTuple {
    MetadataTuple(key: key, value: .scalar(value))
}

// MARK: - reset()

@MainActor struct MarkupDocumentResetTests {

    @Test func clearsCurrentFileURL() {
        let doc = MarkupDocument()
        doc.currentFileURL = URL(filePath: "/tmp/test.html")
        doc.reset()
        #expect(doc.currentFileURL == nil)
    }

    @Test func resetsRootFilename() {
        let doc = MarkupDocument()
        doc.rootFilename = "notes.html"
        doc.reset()
        #expect(doc.rootFilename == "index.html")
    }

    @Test func clearsMetadata() {
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata()]
        doc.reset()
        #expect(doc.metadata.isEmpty)
    }

    @Test func preservesActiveType() {
        let doc = MarkupDocument()
        doc.activeType = .htmd
        doc.reset()
        #expect(doc.activeType == .htmd)
    }

    @Test func hasChangesIsFalseAfterReset() {
        let doc = MarkupDocument()
        // metadata assignment triggers didSet → hasChanges = true;
        // reset() must set hasChanges = false last to override it.
        doc.metadata = [makeMetadata()]
        doc.reset()
        #expect(doc.hasChanges == false)
    }
}

// MARK: - metadata didSet

@MainActor struct MarkupDocumentMetadataDidSetTests {

    @Test func settingNonEmptyMetadataSetsHasChanges() {
        let doc = MarkupDocument()
        #expect(doc.hasChanges == false)
        doc.metadata = [makeMetadata()]
        #expect(doc.hasChanges == true)
    }

    @Test func settingEmptyArrayAlsoSetsHasChanges() {
        let doc = MarkupDocument()
        doc.hasChanges = false
        doc.metadata = []
        #expect(doc.hasChanges == true)
    }
}

// MARK: - save() guard conditions

@MainActor struct MarkupDocumentSaveGuardTests {

    @Test func nilActiveTypeThrowsUnknownType() {
        let doc = MarkupDocument()
        // activeType is nil by default
        #expect(throws: DocumentError.unknownType) {
            try doc.save(html: "<p></p>", srcs: [], baseUrl: URL(filePath: "/tmp"))
        }
    }

    @Test func nilCurrentFileURLThrowsNoCurrentURL() {
        let doc = MarkupDocument()
        doc.activeType = .html
        // currentFileURL is nil by default
        #expect(throws: DocumentError.noCurrentURL) {
            try doc.save(html: "<p></p>", srcs: [], baseUrl: URL(filePath: "/tmp"))
        }
    }
}

// MARK: - open methods set model state
//
// setOpenResult is private; these tests verify its contract through the
// public open methods that call it.

@MainActor struct MarkupDocumentOpenResultTests {

    @Test func openHtmlSetsAllProperties() throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: dir); try? fm.removeItem(at: baseUrl) }
        let fileURL = dir.appendingPathComponent("test.html")
        try "<p>Hello</p>".write(to: fileURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        _ = try doc.openHtml(at: fileURL, baseUrl: baseUrl)
        #expect(doc.currentFileURL == fileURL)
        #expect(doc.activeType == .html)
        #expect(doc.metadata.isEmpty)
    }

    @Test func openHtmlLeavesHasChangesFalse() throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: dir); try? fm.removeItem(at: baseUrl) }
        let fileURL = dir.appendingPathComponent("doc.html")
        try "<p></p>".write(to: fileURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        _ = try doc.openHtml(at: fileURL, baseUrl: baseUrl)
        #expect(doc.hasChanges == false)
    }

    @Test func openHtmlDefaultsRootFilenameToIndexHtml() throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: dir); try? fm.removeItem(at: baseUrl) }
        let fileURL = dir.appendingPathComponent("doc.html")
        try "<p></p>".write(to: fileURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        doc.rootFilename = "notes.html"
        _ = try doc.openHtml(at: fileURL, baseUrl: baseUrl)
        #expect(doc.rootFilename == "index.html")
    }

    @Test func openHtmdSetsCustomRootFilename() throws {
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: baseUrl) }
        try "<p></p>".write(to: pkg.appendingPathComponent("doc.html"), atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        _ = try doc.openHtmd(at: pkg, baseUrl: baseUrl)
        #expect(doc.rootFilename == "doc.html")
    }
}

// MARK: - openHtml

@MainActor struct MarkupDocumentOpenHtmlTests {

    @Test func returnsHtmlContent() throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: dir); try? fm.removeItem(at: baseUrl) }
        let fileURL = dir.appendingPathComponent("test.html")
        try "<p>Hello</p>".write(to: fileURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        let html = try doc.openHtml(at: fileURL, baseUrl: baseUrl)
        #expect(html == "<p>Hello</p>")
    }

    @Test func setsModelStateOnOpen() throws {
        // openHtml calls setOpenResult, updating model state.
        let fm = FileManager.default
        let dir = try makeTempDir()
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: dir); try? fm.removeItem(at: baseUrl) }
        let fileURL = dir.appendingPathComponent("doc.html")
        try "<p>content</p>".write(to: fileURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        _ = try doc.openHtml(at: fileURL, baseUrl: baseUrl)
        #expect(doc.currentFileURL == fileURL)
        #expect(doc.activeType == .html)
        #expect(doc.metadata.isEmpty)
        #expect(doc.hasChanges == false)
    }

    @Test func throwsOnMissingFile() throws {
        let doc = MarkupDocument()
        let baseUrl = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: baseUrl) }
        let missing = URL(filePath: "/tmp/nonexistent-\(UUID().uuidString).html")
        #expect(throws: (any Error).self) {
            try doc.openHtml(at: missing, baseUrl: baseUrl)
        }
    }
}

// MARK: - openHtmd

@MainActor struct MarkupDocumentOpenHtmdTests {

    @Test func returnsHtmlAndSetsRootFilename() throws {
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: baseUrl) }
        try "<p>Hello</p>".write(to: pkg.appendingPathComponent("root.html"), atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        let html = try doc.openHtmd(at: pkg, baseUrl: baseUrl)
        #expect(html == "<p>Hello</p>")
        #expect(doc.rootFilename == "root.html")
    }

    @Test func setsModelStateOnSuccess() throws {
        // openHtmd calls setOpenResult after a successful read.
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: baseUrl) }
        try "<p></p>".write(to: pkg.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        _ = try doc.openHtmd(at: pkg, baseUrl: baseUrl)
        #expect(doc.currentFileURL == pkg)
        #expect(doc.activeType == .htmd)
        #expect(doc.hasChanges == false)
        #expect(doc.rootFilename == "index.html")
    }

    @Test func doesNotMutateRootFilenameOnThrow() throws {
        // C1 regression: a failed open must leave rootFilename completely untouched.
        // Setup: HTML references an image not present in the package → missingPackageImage throw.
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: baseUrl) }
        try #"<img src="missing.png">"#.write(
            to: pkg.appendingPathComponent("doc.html"),
            atomically: true,
            encoding: .utf8
        )
        let doc = MarkupDocument()
        doc.rootFilename = "original.html"
        #expect(throws: (any Error).self) {
            try doc.openHtmd(at: pkg, baseUrl: baseUrl)
        }
        #expect(doc.rootFilename == "original.html")
    }
}

// MARK: - saveHtmd / willSaveTo

@MainActor struct MarkupDocumentSaveHtmdTests {

    @Test func metadataWrittenToIndexDataRegardlessOfRootFilename() throws {
        // C2 regression: saveHtmd must write index.data because saveAsHtmd always
        // writes index.html — the two must always use the same base name.
        let fm = FileManager.default
        let baseUrl = try makeTempDir()
        let destPkg = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".htmd")
        defer { try? fm.removeItem(at: baseUrl); try? fm.removeItem(at: destPkg) }
        let doc = MarkupDocument()
        doc.rootFilename = "notes.html"
        doc.metadata = [makeMetadata("title", "My Doc")]
        try doc.saveHtmd(html: "<p></p>", to: destPkg, srcs: [], baseUrl: baseUrl)
        #expect(fm.fileExists(atPath: destPkg.appendingPathComponent("index.data").path(percentEncoded: false)))
        #expect(!fm.fileExists(atPath: destPkg.appendingPathComponent("notes.data").path(percentEncoded: false)))
    }

    @Test func willSaveToResetsRootFilenameForHtmd() {
        let doc = MarkupDocument()
        doc.rootFilename = "notes.html"
        doc.willSaveTo(url: URL(filePath: "/tmp/new.htmd"), fileExtension: "htmd")
        #expect(doc.rootFilename == "index.html")
    }

    @Test func willSaveToPreservesRootFilenameForHtml() {
        // .html saves do not use rootFilename — it must not be reset.
        let doc = MarkupDocument()
        doc.rootFilename = "notes.html"
        doc.willSaveTo(url: URL(filePath: "/tmp/new.html"), fileExtension: "html")
        #expect(doc.rootFilename == "notes.html")
    }

    @Test func willSaveToClearsHasChanges() {
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata()]  // triggers hasChanges = true
        doc.willSaveTo(url: URL(filePath: "/tmp/new.html"), fileExtension: "html")
        #expect(doc.hasChanges == false)
    }

    @Test func willSaveToUpdatesDocumentIdentity() {
        let doc = MarkupDocument()
        let url = URL(filePath: "/tmp/saved.htmd")
        doc.willSaveTo(url: url, fileExtension: "htmd")
        #expect(doc.currentFileURL == url)
        #expect(doc.activeType == .htmd)
    }
}

// MARK: - non-html/htmd extension save (safety net)
//
// handleSave dispatches to invokePlugin for plugin extensions (.md, .rst, etc.)
// and never calls document.save(). These tests verify the document.save()
// safety-net: DocumentType cases without an explicit save path hit default:break
// (no write, no throw). We use .md as the representative case — DocumentType is
// now an enum, so unknown extensions like "rst" return nil from forExt() and
// would hit the .unknownType guard before the switch.

@MainActor struct MarkupDocumentSavePluginTests {

    @Test func nonHtmlTypeDoesNotThrowOnSave() throws {
        let tempDir = try makeTempDir()
        let mdURL = tempDir.appendingPathComponent("test.md")
        defer { try? FileManager.default.removeItem(at: tempDir) }
        try "".write(to: mdURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        doc.activeType = .md
        doc.currentFileURL = mdURL
        #expect(throws: Never.self) {
            try doc.save(html: "<p>test</p>", srcs: [], baseUrl: tempDir)
        }
    }

    @Test func nonHtmlTypeDoesNotWriteFileOnSave() throws {
        let tempDir = try makeTempDir()
        let mdURL = tempDir.appendingPathComponent("test.md")
        defer { try? FileManager.default.removeItem(at: tempDir) }
        let original = "original content"
        try original.write(to: mdURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        doc.activeType = .md
        doc.currentFileURL = mdURL
        try doc.save(html: "<p>new content</p>", srcs: [], baseUrl: tempDir)
        let afterSave = try String(contentsOf: mdURL, encoding: .utf8)
        #expect(afterSave == original)
    }
}
