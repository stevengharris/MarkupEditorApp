//
//  DocumentOpenerTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor struct SaveHtmlTests {

    private func makeTempDir() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func writesHtmlFile() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let dir = try makeTempDir()
        let dest = dir.appendingPathComponent("out.html")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: dir) }
        try MarkupDocument().saveHtml(html: "<p>world</p>", to: dest, srcs: [], baseUrl: base)
        let written = try String(contentsOf: dest, encoding: .utf8)
        #expect(written == "<p>world</p>")
    }

    @Test func copiesImageAlongsideHtml() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let dir = try makeTempDir()
        let dest = dir.appendingPathComponent("out.html")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: dir) }
        try "img".write(to: base.appendingPathComponent("photo.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().saveHtml(html: "<p></p>", to: dest, srcs: ["photo.png"], baseUrl: base)
        #expect(fm.fileExists(atPath: dir.appendingPathComponent("photo.png").path(percentEncoded: false)))
    }

    @Test func preservesSubdirectoryAlongsideHtml() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let dir = try makeTempDir()
        let dest = dir.appendingPathComponent("out.html")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: dir) }
        try fm.createDirectory(at: base.appendingPathComponent("resources"), withIntermediateDirectories: true)
        try "img".write(to: base.appendingPathComponent("resources/img.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().saveHtml(html: "<p></p>", to: dest, srcs: ["resources/img.png"], baseUrl: base)
        #expect(fm.fileExists(atPath: dir.appendingPathComponent("resources/img.png").path(percentEncoded: false)))
    }

    @Test func silentlySkipsMissingBaseUrlSrc() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let dir = try makeTempDir()
        let dest = dir.appendingPathComponent("out.html")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: dir) }
        try MarkupDocument().saveHtml(html: "<p></p>", to: dest, srcs: ["absent.png"], baseUrl: base)
        #expect(!fm.fileExists(atPath: dir.appendingPathComponent("absent.png").path(percentEncoded: false)))
    }

    @Test func doesNotDeleteExistingFiles() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let dir = try makeTempDir()
        let dest = dir.appendingPathComponent("out.html")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: dir) }
        try "other".write(to: dir.appendingPathComponent("other.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().saveHtml(html: "<p></p>", to: dest, srcs: [], baseUrl: base)
        #expect(fm.fileExists(atPath: dir.appendingPathComponent("other.png").path(percentEncoded: false)))
    }
}

@MainActor struct LocalImageSrcsTests {

    @Test func emptyHtml() {
        #expect(MarkupDocument().localImageSrcs(in: "") == [])
    }

    @Test func noImages() {
        #expect(MarkupDocument().localImageSrcs(in: "<p>Hello</p>") == [])
    }

    @Test func httpExcluded() {
        #expect(MarkupDocument().localImageSrcs(in: #"<img src="http://example.com/foo.png">"#) == [])
    }

    @Test func httpsExcluded() {
        #expect(MarkupDocument().localImageSrcs(in: #"<img src="https://example.com/foo.png">"#) == [])
    }

    @Test func dataExcluded() {
        #expect(MarkupDocument().localImageSrcs(in: #"<img src="data:image/png;base64,abc">"#) == [])
    }

    @Test func protocolRelativeExcluded() {
        #expect(MarkupDocument().localImageSrcs(in: #"<img src="//example.com/foo.png">"#) == [])
    }

    @Test func absolutePathExcluded() {
        #expect(MarkupDocument().localImageSrcs(in: #"<img src="/images/foo.png">"#) == [])
    }

    @Test func singleLocal() {
        #expect(MarkupDocument().localImageSrcs(in: #"<img src="foo.png">"#) == ["foo.png"])
    }

    @Test func subdirectory() {
        #expect(MarkupDocument().localImageSrcs(in: #"<img src="resources/foo.png">"#) == ["resources/foo.png"])
    }

    @Test func mixedSrcs() {
        let html = #"<img src="local.png"><img src="http://remote.com/x.png"><img src="resources/bar.png">"#
        #expect(Set(MarkupDocument().localImageSrcs(in: html)) == Set(["local.png", "resources/bar.png"]))
    }

    @Test func singleQuotedSrc() {
        #expect(MarkupDocument().localImageSrcs(in: "<img src='foo.png'>") == ["foo.png"])
    }

    @Test func srcWithOtherAttributes() {
        #expect(MarkupDocument().localImageSrcs(in: #"<img alt="x" src="foo.png" width="100">"#) == ["foo.png"])
    }
}

@MainActor struct CopyImageAssetsTests {

    private func makeTempDir() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func emptySrcsNoOp() throws {
        let src = try makeTempDir()
        let dst = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: src); try? FileManager.default.removeItem(at: dst) }
        try MarkupDocument().copyImageAssets(srcs: [], from: src, to: dst, skipMissing: false, replaceExisting: false)
    }

    @Test func copiesFile() throws {
        let fm = FileManager.default
        let src = try makeTempDir()
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: src); try? fm.removeItem(at: dst) }
        try "data".write(to: src.appendingPathComponent("foo.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().copyImageAssets(srcs: ["foo.png"], from: src, to: dst, skipMissing: false, replaceExisting: false)
        #expect(fm.fileExists(atPath: dst.appendingPathComponent("foo.png").path(percentEncoded: false)))
    }

    @Test func skipsMissingWhenAllowed() throws {
        let fm = FileManager.default
        let src = try makeTempDir()
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: src); try? fm.removeItem(at: dst) }
        try MarkupDocument().copyImageAssets(srcs: ["missing.png"], from: src, to: dst, skipMissing: true, replaceExisting: false)
        #expect(!fm.fileExists(atPath: dst.appendingPathComponent("missing.png").path(percentEncoded: false)))
    }

    @Test func throwsForMissingWhenNotSkipping() throws {
        let fm = FileManager.default
        let src = try makeTempDir()
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: src); try? fm.removeItem(at: dst) }
        #expect(throws: MarkupDocumentError.missingImage("missing.png")) {
            try MarkupDocument().copyImageAssets(srcs: ["missing.png"], from: src, to: dst, skipMissing: false, replaceExisting: false)
        }
    }

    @Test func createsSubdirectories() throws {
        let fm = FileManager.default
        let src = try makeTempDir()
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: src); try? fm.removeItem(at: dst) }
        try fm.createDirectory(at: src.appendingPathComponent("resources"), withIntermediateDirectories: true)
        try "data".write(to: src.appendingPathComponent("resources/foo.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().copyImageAssets(srcs: ["resources/foo.png"], from: src, to: dst, skipMissing: false, replaceExisting: false)
        #expect(fm.fileExists(atPath: dst.appendingPathComponent("resources/foo.png").path(percentEncoded: false)))
    }

    @Test func overwritesExistingFile() throws {
        let fm = FileManager.default
        let src = try makeTempDir()
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: src); try? fm.removeItem(at: dst) }
        try "new".write(to: src.appendingPathComponent("foo.png"), atomically: true, encoding: .utf8)
        try "old".write(to: dst.appendingPathComponent("foo.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().copyImageAssets(srcs: ["foo.png"], from: src, to: dst, skipMissing: false, replaceExisting: true)
        let content = try String(contentsOf: dst.appendingPathComponent("foo.png"), encoding: .utf8)
        #expect(content == "new")
    }
}

