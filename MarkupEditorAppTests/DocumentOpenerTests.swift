//
//  DocumentOpenerTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor struct SaveHtmdTests {

    private func makeTempDir(suffix: String = "") throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + suffix)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func createsPackageDirectory() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let pkg = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".htmd")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: pkg) }
        try MarkupDocument().saveHtmd(html: "<p></p>", to: pkg, srcs: [], baseUrl: base)
        #expect(fm.fileExists(atPath: pkg.path(percentEncoded: false)))
    }

    @Test func writesIndexHtml() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let pkg = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".htmd")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: pkg) }
        try MarkupDocument().saveHtmd(html: "<p>hello</p>", to: pkg, srcs: [], baseUrl: base)
        let written = try String(contentsOf: pkg.appendingPathComponent("index.html"), encoding: .utf8)
        #expect(written == "<p>hello</p>")
    }

    @Test func copiesImageFromBaseUrl() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let pkg = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".htmd")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: pkg) }
        try "img".write(to: base.appendingPathComponent("photo.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().saveHtmd(html: "<p></p>", to: pkg, srcs: ["photo.png"], baseUrl: base)
        #expect(fm.fileExists(atPath: pkg.appendingPathComponent("photo.png").path(percentEncoded: false)))
    }

    @Test func preservesSubdirectoryInPackage() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let pkg = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".htmd")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: pkg) }
        try fm.createDirectory(at: base.appendingPathComponent("resources"), withIntermediateDirectories: true)
        try "img".write(to: base.appendingPathComponent("resources/img.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().saveHtmd(html: "<p></p>", to: pkg, srcs: ["resources/img.png"], baseUrl: base)
        #expect(fm.fileExists(atPath: pkg.appendingPathComponent("resources/img.png").path(percentEncoded: false)))
    }

    @Test func silentlySkipsMissingBaseUrlSrc() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let pkg = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".htmd")
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: pkg) }
        try MarkupDocument().saveHtmd(html: "<p></p>", to: pkg, srcs: ["absent.png"], baseUrl: base)
        #expect(!fm.fileExists(atPath: pkg.appendingPathComponent("absent.png").path(percentEncoded: false)))
    }

    @Test func replacesExistingPackage() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let pkg = fm.temporaryDirectory.appendingPathComponent(UUID().uuidString + ".htmd")
        try fm.createDirectory(at: pkg, withIntermediateDirectories: true)
        try "old".write(to: pkg.appendingPathComponent("stale.png"), atomically: true, encoding: .utf8)
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: pkg) }
        try MarkupDocument().saveHtmd(html: "<p></p>", to: pkg, srcs: [], baseUrl: base)
        #expect(!fm.fileExists(atPath: pkg.appendingPathComponent("stale.png").path(percentEncoded: false)))
    }
}

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

@MainActor struct SyncImageAssetsTests {

    private func makeTempDir() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func copiesNewImageToDocDir() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try "img".write(to: base.appendingPathComponent("foo.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().syncPackageAssets(srcs: ["foo.png"], baseUrl: base, to: doc, deleteOrphans: false)
        #expect(fm.fileExists(atPath: doc.appendingPathComponent("foo.png").path(percentEncoded: false)))
    }

    @Test func skipsExistingImage() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try "base".write(to: base.appendingPathComponent("foo.png"), atomically: true, encoding: .utf8)
        try "original".write(to: doc.appendingPathComponent("foo.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().syncPackageAssets(srcs: ["foo.png"], baseUrl: base, to: doc, deleteOrphans: false)
        let content = try String(contentsOf: doc.appendingPathComponent("foo.png"), encoding: .utf8)
        #expect(content == "original")
    }

    @Test func skipsMissingBaseUrlFile() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try MarkupDocument().syncPackageAssets(srcs: ["missing.png"], baseUrl: base, to: doc, deleteOrphans: false)
        #expect(!fm.fileExists(atPath: doc.appendingPathComponent("missing.png").path(percentEncoded: false)))
    }

    @Test func deletesOrphanWhenEnabled() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try "orphan".write(to: doc.appendingPathComponent("orphan.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().syncPackageAssets(srcs: [], baseUrl: base, to: doc, deleteOrphans: true)
        #expect(!fm.fileExists(atPath: doc.appendingPathComponent("orphan.png").path(percentEncoded: false)))
    }

    @Test func keepsOrphanWhenDisabled() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try "orphan".write(to: doc.appendingPathComponent("orphan.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().syncPackageAssets(srcs: [], baseUrl: base, to: doc, deleteOrphans: false)
        #expect(fm.fileExists(atPath: doc.appendingPathComponent("orphan.png").path(percentEncoded: false)))
    }

    @Test func preservesSubdirectoryStructure() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try fm.createDirectory(at: base.appendingPathComponent("resources"), withIntermediateDirectories: true)
        try "img".write(to: base.appendingPathComponent("resources/bar.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().syncPackageAssets(srcs: ["resources/bar.png"], baseUrl: base, to: doc, deleteOrphans: false)
        #expect(fm.fileExists(atPath: doc.appendingPathComponent("resources/bar.png").path(percentEncoded: false)))
    }

    @Test func doesNotDeleteHtmlWhenOrphaning() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try "html".write(to: doc.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        try MarkupDocument().syncPackageAssets(srcs: [], baseUrl: base, to: doc, deleteOrphans: true)
        #expect(fm.fileExists(atPath: doc.appendingPathComponent("index.html").path(percentEncoded: false)))
    }

    @Test func deletesSubdirectoryOrphan() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try fm.createDirectory(at: doc.appendingPathComponent("resources"), withIntermediateDirectories: true)
        try "img".write(to: doc.appendingPathComponent("resources/old.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().syncPackageAssets(srcs: [], baseUrl: base, to: doc, deleteOrphans: true)
        #expect(!fm.fileExists(atPath: doc.appendingPathComponent("resources/old.png").path(percentEncoded: false)))
    }

    @Test func keepsReferencedImageDeletesOrphan() throws {
        let fm = FileManager.default
        let base = try makeTempDir()
        let doc = try makeTempDir()
        defer { try? fm.removeItem(at: base); try? fm.removeItem(at: doc) }
        try "img".write(to: doc.appendingPathComponent("kept.png"), atomically: true, encoding: .utf8)
        try "img".write(to: doc.appendingPathComponent("orphan.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().syncPackageAssets(srcs: ["kept.png"], baseUrl: base, to: doc, deleteOrphans: true)
        #expect(fm.fileExists(atPath: doc.appendingPathComponent("kept.png").path(percentEncoded: false)))
        #expect(!fm.fileExists(atPath: doc.appendingPathComponent("orphan.png").path(percentEncoded: false)))
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

struct PluginResultDecodeTests {

    @Test func validEnvelopeWithWarnings() {
        let json = #"{"result":"<p>hello</p>","warnings":["warn1","warn2"]}"#
        let decoded = ImportExportValue.decode(from: json)
        #expect(decoded?.result == "<p>hello</p>")
        #expect(decoded?.warnings == ["warn1", "warn2"])
    }

    @Test func nilResult() {
        let json = #"{"result":null,"warnings":[]}"#
        let decoded = ImportExportValue.decode(from: json)
        #expect(decoded != nil)
        #expect(decoded?.result == nil)
        #expect(decoded?.warnings.isEmpty == true)
    }

    @Test func malformedJsonReturnsNil() {
        #expect(ImportExportValue.decode(from: "not json") == nil)
    }

    @Test func missingWarningsKeyReturnsNil() {
        let json = #"{"result":"<p>hi</p>"}"#
        #expect(ImportExportValue.decode(from: json) == nil)
    }
}

@MainActor struct CopyPackageAssetsTests {

    private func makeTempDir(suffix: String = "") throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString + suffix)
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func emptyPackage() throws {
        let pkg = try makeTempDir(suffix: ".htmd")
        let dst = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: pkg); try? FileManager.default.removeItem(at: dst) }
        let paths = try MarkupDocument().copyPackageAssets(from: pkg, to: dst)
        #expect(paths.isEmpty)
    }

    @Test func skipsHtmlFiles() throws {
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: dst) }
        try "html".write(to: pkg.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        let paths = try MarkupDocument().copyPackageAssets(from: pkg, to: dst)
        #expect(paths.isEmpty)
        #expect(!fm.fileExists(atPath: dst.appendingPathComponent("index.html").path(percentEncoded: false)))
    }

    @Test func copiesImageFile() throws {
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: dst) }
        try "img".write(to: pkg.appendingPathComponent("foo.png"), atomically: true, encoding: .utf8)
        let paths = try MarkupDocument().copyPackageAssets(from: pkg, to: dst)
        #expect(paths == ["foo.png"])
        #expect(fm.fileExists(atPath: dst.appendingPathComponent("foo.png").path(percentEncoded: false)))
    }

    @Test func preservesSubdirectories() throws {
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: dst) }
        try fm.createDirectory(at: pkg.appendingPathComponent("resources"), withIntermediateDirectories: true)
        try "img".write(to: pkg.appendingPathComponent("resources/bar.png"), atomically: true, encoding: .utf8)
        let paths = try MarkupDocument().copyPackageAssets(from: pkg, to: dst)
        #expect(paths == ["resources/bar.png"])
        #expect(fm.fileExists(atPath: dst.appendingPathComponent("resources/bar.png").path(percentEncoded: false)))
    }

    @Test func copiesMultipleFiles() throws {
        let fm = FileManager.default
        let pkg = try makeTempDir(suffix: ".htmd")
        let dst = try makeTempDir()
        defer { try? fm.removeItem(at: pkg); try? fm.removeItem(at: dst) }
        try fm.createDirectory(at: pkg.appendingPathComponent("resources"), withIntermediateDirectories: true)
        try "img1".write(to: pkg.appendingPathComponent("a.png"), atomically: true, encoding: .utf8)
        try "img2".write(to: pkg.appendingPathComponent("resources/b.png"), atomically: true, encoding: .utf8)
        try "html".write(to: pkg.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
        let paths = try MarkupDocument().copyPackageAssets(from: pkg, to: dst)
        #expect(paths == Set(["a.png", "resources/b.png"]))
        #expect(fm.fileExists(atPath: dst.appendingPathComponent("a.png").path(percentEncoded: false)))
        #expect(fm.fileExists(atPath: dst.appendingPathComponent("resources/b.png").path(percentEncoded: false)))
        #expect(!fm.fileExists(atPath: dst.appendingPathComponent("index.html").path(percentEncoded: false)))
    }
}
