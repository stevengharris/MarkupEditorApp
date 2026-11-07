//
//  ImageEmbedderTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct ImageEmbedderTests {

    private func makeDir() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func embedsAnImageInTheBaseFolderAndASubfolder() throws {
        let base = try makeDir()
        try FileManager.default.createDirectory(at: base.appendingPathComponent("img"), withIntermediateDirectories: true)
        try Data([1, 2, 3]).write(to: base.appendingPathComponent("a.png"))
        try Data([1, 2, 3]).write(to: base.appendingPathComponent("img/b.png"))
        let html = ImageEmbedder.embedding(["a.png", "img/b.png"], in: "<img src=\"a.png\"><img src=\"img/b.png\">", baseURL: base)
        #expect(html == "<img src=\"data:image/png;base64,AQID\"><img src=\"data:image/png;base64,AQID\">")
    }

    @Test func embedsAnImageWhoseSourceIsPercentEncoded() throws {
        let base = try makeDir()
        try Data([1, 2, 3]).write(to: base.appendingPathComponent("my image.png"))
        let html = ImageEmbedder.embedding(["my%20image.png"], in: "<img src=\"my%20image.png\">", baseURL: base)
        #expect(html == "<img src=\"data:image/png;base64,AQID\">")
    }

    @Test func reportsTheSourcesItLeftAlone() throws {
        let base = try makeDir()
        try Data([1, 2, 3]).write(to: base.appendingPathComponent("a.png"))
        let result = ImageEmbedder.embed(["a.png", "../x.png", "missing.png"], in: "", baseURL: base)
        #expect(result.skipped == ["../x.png", "missing.png"])
    }

    @Test func leavesASiblingFolderWithTheSamePrefixAlone() throws {
        let parent = try makeDir()
        let base = parent.appendingPathComponent("doc")
        let sibling = parent.appendingPathComponent("doc-evil")
        for dir in [base, sibling] { try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true) }
        try Data([1, 2, 3]).write(to: sibling.appendingPathComponent("s.png"))
        let html = "<img src=\"../doc-evil/s.png\">"
        #expect(ImageEmbedder.embedding(["../doc-evil/s.png"], in: html, baseURL: base) == html)
    }

    @Test func embedsEveryOccurrenceOfARepeatedSource() throws {
        let base = try makeDir()
        try Data([1, 2, 3]).write(to: base.appendingPathComponent("a.png"))
        let html = ImageEmbedder.embedding(["a.png", "a.png"], in: "<img src=\"a.png\"><img src=\"a.png\">", baseURL: base)
        #expect(html == "<img src=\"data:image/png;base64,AQID\"><img src=\"data:image/png;base64,AQID\">")
    }

    @Test func leavesASourceOutsideTheBaseFolderAlone() throws {
        let parent = try makeDir()
        let base = parent.appendingPathComponent("doc")
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        try Data([1, 2, 3]).write(to: parent.appendingPathComponent("secret.png"))
        let html = "<img src=\"../secret.png\">"
        #expect(ImageEmbedder.embedding(["../secret.png"], in: html, baseURL: base) == html)
    }

    @Test func leavesASymlinkThatEscapesTheBaseFolderAlone() throws {
        let parent = try makeDir()
        let base = parent.appendingPathComponent("doc")
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        try Data([1, 2, 3]).write(to: parent.appendingPathComponent("secret.png"))
        try FileManager.default.createSymbolicLink(at: base.appendingPathComponent("link.png"), withDestinationURL: parent.appendingPathComponent("secret.png"))
        let html = "<img src=\"link.png\">"
        #expect(ImageEmbedder.embedding(["link.png"], in: html, baseURL: base) == html)
    }

    @Test func leavesAFileThatIsNotAnImageAlone() throws {
        let base = try makeDir()
        try Data("secret".utf8).write(to: base.appendingPathComponent("notes.txt"))
        let html = "<img src=\"notes.txt\">"
        #expect(ImageEmbedder.embedding(["notes.txt"], in: html, baseURL: base) == html)
    }

    @Test func leavesAnUnreadableImageAlone() throws {
        let base = try makeDir()
        let html = "<img src=\"absent.png\">"
        #expect(ImageEmbedder.embedding(["absent.png"], in: html, baseURL: base) == html)
    }
}
