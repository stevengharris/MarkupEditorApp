//
//  PluginInstallerTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorApp

private let validExporterEntry = PluginCatalogEntry(
    name: "DocX",
    filename: "markupeditor-exporter-docx.js",
    description: "MarkupEditor exporter plugin for DOCX.",
    author: "Steven G. Harris",
    version: "0.1.0",
    repo: "https://github.com/stevengharris/markupeditor-desktop",
    source: "https://raw.githubusercontent.com/stevengharris/markupeditor-desktop/main/plugins/markupeditor-exporter-docx/dist/markupeditor-exporter-docx.js",
    ext: "docx"
)

private let entryMissingExt = PluginCatalogEntry(
    name: "DocX",
    filename: "markupeditor-exporter-docx.js",
    description: "MarkupEditor exporter plugin for DOCX.",
    author: "Steven G. Harris",
    version: "0.1.0",
    repo: "https://github.com/stevengharris/markupeditor-desktop",
    source: "https://raw.githubusercontent.com/stevengharris/markupeditor-desktop/main/plugins/markupeditor-exporter-docx/dist/markupeditor-exporter-docx.js",
    ext: nil
)

@Suite
struct PluginInstallerTests {

    @Test func installDestinationUsesEntryFilenameNotDownloadedName() {
        let downloadDir = URL(fileURLWithPath: "/tmp/CFNetworkDownload_random123", isDirectory: true)

        let destination = installDestination(for: validExporterEntry, in: downloadDir)

        #expect(destination.lastPathComponent == "markupeditor-exporter-docx.js")
        #expect(destination.deletingLastPathComponent().path == downloadDir.path)
    }

    @MainActor
    @Test func exporterWithoutExtThrowsBeforeAnyNetworkCall() async {
        await #expect(throws: PluginInstallError.missingExtension("DocX")) {
            try await installPlugin(entryMissingExt, type: .exporter)
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
            try await installPlugin(badEntry, type: .codeview)
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
            CodeViewManager.shared.delete(Plugin(name: entry.name, type: "codeview", filename: entry.filename))
        }

        try await installPlugin(entry, type: .codeview) { _ in
            (fakeDownloadedFile, fakeResponse)
        }

        #expect(CodeViewManager.shared.nameExists(entry.name))
        // nameExists alone doesn't directly prove the rename -- CodeViewManager.add()'s
        // own fileExists guard would fail closed on a pre-rename URL, so this only
        // proved the rename indirectly. Assert the stored filename directly instead.
        #expect(AppConfig.shared.codeViews.first(where: { $0.name == entry.name })?.filename == entry.filename)
    }
}
