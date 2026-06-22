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

    @Test func resetsRootHtmlFilename() {
        let doc = MarkupDocument()
        doc.rootHtmlFilename = "notes.html"
        doc.reset()
        #expect(doc.rootHtmlFilename == "index.html")
    }

    @Test func clearsDocumentMetadata() {
        let doc = MarkupDocument()
        doc.documentMetadata = [makeMetadata()]
        doc.reset()
        #expect(doc.documentMetadata.isEmpty)
    }

    @Test func preservesActiveFileExtension() {
        let doc = MarkupDocument()
        doc.activeFileExtension = "htmd"
        doc.reset()
        #expect(doc.activeFileExtension == "htmd")
    }

    @Test func hasChangesIsFalseAfterReset() {
        let doc = MarkupDocument()
        // documentMetadata assignment triggers didSet → hasChanges = true;
        // reset() must set hasChanges = false last to override it.
        doc.documentMetadata = [makeMetadata()]
        doc.reset()
        #expect(doc.hasChanges == false)
    }
}

// MARK: - documentMetadata didSet

@MainActor struct MarkupDocumentMetadataDidSetTests {

    @Test func settingNonEmptyMetadataSetsHasChanges() {
        let doc = MarkupDocument()
        #expect(doc.hasChanges == false)
        doc.documentMetadata = [makeMetadata()]
        #expect(doc.hasChanges == true)
    }

    @Test func settingEmptyArrayAlsoSetsHasChanges() {
        let doc = MarkupDocument()
        doc.hasChanges = false
        doc.documentMetadata = []
        #expect(doc.hasChanges == true)
    }
}

// MARK: - save() guard conditions

@MainActor struct MarkupDocumentSaveGuardTests {

    @Test func nilActiveFileExtensionThrowsUnknownType() {
        let doc = MarkupDocument()
        // activeFileExtension is nil by default
        #expect(throws: DocumentError.unknownType) {
            try doc.save(html: "<p></p>", srcs: [], baseUrl: URL(filePath: "/tmp"))
        }
    }

    @Test func nilCurrentFileURLThrowsNoCurrentURL() {
        let doc = MarkupDocument()
        doc.activeFileExtension = "html"
        // currentFileURL is nil by default
        #expect(throws: DocumentError.noCurrentURL) {
            try doc.save(html: "<p></p>", srcs: [], baseUrl: URL(filePath: "/tmp"))
        }
    }
}

// MARK: - setOpenResult

@MainActor struct MarkupDocumentSetOpenResultTests {

    @Test func setsAllProperties() {
        let doc = MarkupDocument()
        let url = URL(filePath: "/tmp/test.html")
        let metadata = [makeMetadata("title", "Hello")]
        doc.setOpenResult(html: "<p></p>", url: url, fileExtension: "html", metadata: metadata)
        #expect(doc.currentFileURL == url)
        #expect(doc.activeFileExtension == "html")
        #expect(doc.documentMetadata == metadata)
    }

    @Test func hasChangesIsFalseAfterSetOpenResult() {
        let doc = MarkupDocument()
        let metadata = [makeMetadata()]
        doc.setOpenResult(html: "<p></p>", url: URL(filePath: "/tmp/doc.html"), fileExtension: "html", metadata: metadata)
        // documentMetadata didSet fires inside setOpenResult but hasChanges must end false
        #expect(doc.hasChanges == false)
    }

    @Test func defaultsRootHtmlFilenameToIndexHtml() {
        let doc = MarkupDocument()
        doc.rootHtmlFilename = "notes.html"
        doc.setOpenResult(html: "<p></p>", url: URL(filePath: "/tmp/doc.html"), fileExtension: "html", metadata: [])
        #expect(doc.rootHtmlFilename == "index.html")
    }

    @Test func setsCustomRootHtmlFilenameForHtmd() {
        let doc = MarkupDocument()
        doc.setOpenResult(
            html: "<p></p>",
            url: URL(filePath: "/tmp/doc.htmd"),
            fileExtension: "htmd",
            metadata: [],
            rootHtmlFilename: "doc.html"
        )
        #expect(doc.rootHtmlFilename == "doc.html")
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

    @Test func doesNotMutateModelState() throws {
        let fm = FileManager.default
        let dir = try makeTempDir()
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: dir); try? fm.removeItem(at: baseUrl) }
        let fileURL = dir.appendingPathComponent("doc.html")
        try "<p>content</p>".write(to: fileURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        _ = try doc.openHtml(at: fileURL, baseUrl: baseUrl)
        #expect(doc.currentFileURL == nil)
        #expect(doc.activeFileExtension == nil)
        #expect(doc.documentMetadata.isEmpty)
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

    @Test func returnsHtmlAndFilename() throws {
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: baseUrl) }
        try "<p>Hello</p>".write(to: pkg.appendingPathComponent("root.html"), atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        let result = try doc.openHtmd(at: pkg, baseUrl: baseUrl)
        #expect(result.html == "<p>Hello</p>")
        #expect(result.rootHtmlFilename == "root.html")
    }

    @Test func doesNotMutateModelStateOnSuccess() throws {
        // openHtmd is a pure read — model state must be unchanged after a successful call.
        // In particular rootHtmlFilename must not be set (C1 contract).
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: baseUrl) }
        try "<p></p>".write(to: pkg.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        _ = try doc.openHtmd(at: pkg, baseUrl: baseUrl)
        #expect(doc.currentFileURL == nil)
        #expect(doc.activeFileExtension == nil)
        #expect(doc.hasChanges == false)
        #expect(doc.rootHtmlFilename == "index.html")  // default, not set by openHtmd
    }

    @Test func doesNotMutateRootHtmlFilenameOnThrow() throws {
        // C1 regression: a failed open must leave rootHtmlFilename completely untouched.
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
        doc.rootHtmlFilename = "original.html"
        #expect(throws: (any Error).self) {
            try doc.openHtmd(at: pkg, baseUrl: baseUrl)
        }
        #expect(doc.rootHtmlFilename == "original.html")
    }
}

// MARK: - saveHtmd / willSaveTo

@MainActor struct MarkupDocumentSaveHtmdTests {

    @Test func metadataWrittenToIndexDataRegardlessOfRootHtmlFilename() throws {
        // C2 regression: saveHtmd must write index.data because saveAsHtmd always
        // writes index.html — the two must always use the same base name.
        let fm = FileManager.default
        let baseUrl = try makeTempDir()
        let destPkg = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".htmd")
        defer { try? fm.removeItem(at: baseUrl); try? fm.removeItem(at: destPkg) }
        let doc = MarkupDocument()
        doc.rootHtmlFilename = "notes.html"
        doc.documentMetadata = [makeMetadata("title", "My Doc")]
        try doc.saveHtmd(html: "<p></p>", to: destPkg, srcs: [], baseUrl: baseUrl)
        #expect(fm.fileExists(atPath: destPkg.appendingPathComponent("index.data").path))
        #expect(!fm.fileExists(atPath: destPkg.appendingPathComponent("notes.data").path))
    }

    @Test func willSaveToResetsRootHtmlFilenameForHtmd() {
        let doc = MarkupDocument()
        doc.rootHtmlFilename = "notes.html"
        doc.willSaveTo(url: URL(filePath: "/tmp/new.htmd"), fileExtension: "htmd")
        #expect(doc.rootHtmlFilename == "index.html")
    }

    @Test func willSaveToPreservesRootHtmlFilenameForHtml() {
        // .html saves do not use rootHtmlFilename — it must not be reset.
        let doc = MarkupDocument()
        doc.rootHtmlFilename = "notes.html"
        doc.willSaveTo(url: URL(filePath: "/tmp/new.html"), fileExtension: "html")
        #expect(doc.rootHtmlFilename == "notes.html")
    }

    @Test func willSaveToClearsHasChanges() {
        let doc = MarkupDocument()
        doc.documentMetadata = [makeMetadata()]  // triggers hasChanges = true
        doc.willSaveTo(url: URL(filePath: "/tmp/new.html"), fileExtension: "html")
        #expect(doc.hasChanges == false)
    }

    @Test func willSaveToUpdatesDocumentIdentity() {
        let doc = MarkupDocument()
        let url = URL(filePath: "/tmp/saved.htmd")
        doc.willSaveTo(url: url, fileExtension: "htmd")
        #expect(doc.currentFileURL == url)
        #expect(doc.activeFileExtension == "htmd")
    }
}
