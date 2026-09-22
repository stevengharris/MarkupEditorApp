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

@MainActor
private func makeMetadata(_ key: String = "title", _ value: String = "Test") -> MetadataTuple {
    MetadataTuple(key: key, value: .scalar(value))
}

// MARK: - reset()

@MainActor struct MarkupDocumentResetTests {

    @Test func clearsUrl() {
        let doc = MarkupDocument()
        doc.url = URL(filePath: "/tmp/test.html")
        doc.reset()
        #expect(doc.url == nil)
    }

    @Test func clearsMetadata() {
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata()]
        doc.reset()
        #expect(doc.metadata.isEmpty)
    }

    @Test func resetsDocumentTypeToMarkdown() {
        // reset() sets url = nil, which triggers url.didSet -> documentType =
        // DocumentType.for(url: nil) ?? .md -- DocumentType.for(url:) returns nil
        // for a nil url (no pathExtension to resolve), so the .md fallback fires.
        let doc = MarkupDocument()
        doc.documentType = .html
        doc.reset()
        #expect(doc.documentType == .md)
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

    @Test func clearingExistingMetadataAlsoSetsHasChanges() {
        let doc = MarkupDocument()
        doc.metadata = [makeMetadata()]
        doc.hasChanges = false
        doc.metadata = []
        #expect(doc.hasChanges == true)
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
        #expect(doc.url == fileURL)
        #expect(doc.documentType == .html)
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
        let fm = FileManager.default
        let dir = try makeTempDir()
        let baseUrl = try makeTempDir()
        defer { try? fm.removeItem(at: dir); try? fm.removeItem(at: baseUrl) }
        let fileURL = dir.appendingPathComponent("doc.html")
        try "<p>content</p>".write(to: fileURL, atomically: true, encoding: .utf8)
        let doc = MarkupDocument()
        _ = try doc.openHtml(at: fileURL, baseUrl: baseUrl)
        #expect(doc.url == fileURL)
        #expect(doc.documentType == .html)
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

