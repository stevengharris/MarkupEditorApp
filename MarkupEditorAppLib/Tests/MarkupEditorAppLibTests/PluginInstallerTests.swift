//
//  PluginInstallerTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorAppLib

private let validExporterEntry = PluginCatalogEntry(
    name: "DocX",
    filename: "exporter-docx.js",
    description: "MarkupEditor exporter plugin for DOCX.",
    author: "Steven G. Harris",
    version: "0.1.0",
    repo: "https://github.com/stevengharris/MarkupEditorApp",
    source: "https://raw.githubusercontent.com/stevengharris/MarkupEditorApp/main/plugins/exporter-docx/dist/exporter-docx.js",
    ext: "docx"
)

private let entryMissingExt = PluginCatalogEntry(
    name: "DocX",
    filename: "exporter-docx.js",
    description: "MarkupEditor exporter plugin for DOCX.",
    author: "Steven G. Harris",
    version: "0.1.0",
    repo: "https://github.com/stevengharris/MarkupEditorApp",
    source: "https://raw.githubusercontent.com/stevengharris/MarkupEditorApp/main/plugins/exporter-docx/dist/exporter-docx.js",
    ext: nil
)

private let testCacheDir = FileManager.default.temporaryDirectory.appendingPathComponent("PluginInstallerTests-cache", isDirectory: true)

@Suite
struct PluginInstallerTests {

    @Test func installDestinationUsesEntryFilenameNotDownloadedName() {
        let downloadDir = URL(fileURLWithPath: "/tmp/CFNetworkDownload_random123", isDirectory: true)

        let destination = installDestination(for: validExporterEntry, in: downloadDir)

        #expect(destination.lastPathComponent == "exporter-docx.js")
        #expect(destination.deletingLastPathComponent().path == downloadDir.path)
    }

    @MainActor
    @Test func exporterWithoutExtThrowsBeforeAnyNetworkCall() async {
        await #expect(throws: PluginInstallError.missingExtension("DocX")) {
            _ = try await installPlugin(entryMissingExt, type: .exporter, exporters: [], codeViews: [], cacheDir: testCacheDir)
        }
    }

    @MainActor
    @Test func invalidSourceURLThrows() async {
        let badEntry = PluginCatalogEntry(
            name: "Bad",
            filename: "bad.js",
            description: "d",
            author: "a",
            version: "1.0.0",
            repo: "https://example.com",
            source: "",
            ext: nil
        )
        await #expect(throws: PluginInstallError.invalidSourceURL("Bad")) {
            _ = try await installPlugin(badEntry, type: .codeview, exporters: [], codeViews: [], cacheDir: testCacheDir)
        }
    }

    /// Exercises the full rename/add/verify sequence with no real network call --
    /// the download step is injected, returning a real local file (a stand-in for
    /// what URLSession.download(from:) itself would have produced) under a
    /// deliberately non-matching filename, so a pass here proves the rename to
    /// entry.filename actually happened before add() saw the file, not just that
    /// add() was called with something.
    @MainActor
    @Test func happyPathRenamesDownloadsAndInstallsThroughRealCodeViewManager() async throws {
        // CodeViewManager.add() writes into defaultDir (~/Library/Application Support/codeviews),
        // normally created once by CodeViewManager.setupOnLaunch() at real app startup. This test
        // has no host app to run that startup path, so it establishes the same precondition
        // directly -- matching what a real app run would already have done before add() is ever
        // reachable.
        try FileManager.default.createDirectory(at: CodeViewManager.defaultDir, withIntermediateDirectories: true)

        let entry = PluginCatalogEntry(
            name: "PluginInstallerHappyPathTest",
            filename: "plugin-installer-happy-path-test.js",
            description: "d",
            author: "a",
            version: "1.0.0",
            repo: "https://example.com",
            source: "https://example.com/plugin-installer-happy-path-test.js",
            ext: nil
        )

        let fakeDownloadDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: fakeDownloadDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: fakeDownloadDir) }
        // A real file, but under URLSession's typical random temp name, not entry.filename.
        let fakeDownloadedFile = fakeDownloadDir.appendingPathComponent("CFNetworkDownload_abc123.tmp")
        try Data("// test plugin content".utf8).write(to: fakeDownloadedFile)

        let sourceURL = try #require(URL(string: entry.source))
        let fakeResponse = try #require(
            HTTPURLResponse(url: sourceURL, statusCode: 200, httpVersion: nil, headerFields: nil)
        )

        defer {
            _ = CodeViewManager.delete(
                Plugin(name: entry.name, type: "codeview", filename: entry.filename),
                codeViews: [Plugin(name: entry.name, type: "codeview", filename: entry.filename)],
                cacheDir: testCacheDir
            )
        }

        let (_, codeViews) = try await installPlugin(entry, type: .codeview, exporters: [], codeViews: [], cacheDir: testCacheDir) { _ in
            (fakeDownloadedFile, fakeResponse)
        }

        #expect(CodeViewManager.nameExists(entry.name, in: codeViews))
        // nameExists alone doesn't directly prove the rename -- CodeViewManager.add()'s
        // own fileExists guard would fail closed on a pre-rename URL, so this only
        // proved the rename indirectly. Assert the stored filename directly instead.
        #expect(codeViews.first(where: { $0.name == entry.name })?.filename == entry.filename)
    }
}
