//
//  HeadlessExportTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
import MarkupEditor
import MarkupEditorAppLib
@testable import MarkupEditorApp

@MainActor
struct HeadlessExportTests {

    @Test func modeIsReadAfterTheFlag() {
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export", "html"]) == .html)
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export", "pdf"]) == .pdf)
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export", "list"]) == .list)
    }

    @Test func aPluginModeCarriesTheExportersName() {
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export", "plugin", "DocX"]) == .plugin("DocX"))
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export", "plugin", "My Exporter"]) == .plugin("My Exporter"))
    }

    @Test func normalLaunchHasNoMode() {
        #expect(HeadlessExport.mode(from: ["MarkupEditor"]) == nil)
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export"]) == nil)
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export", "docx"]) == nil)
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export", "plugin"]) == nil)
        #expect(HeadlessExport.mode(from: ["MarkupEditor", "--headless-export", "plugin", ""]) == nil)
    }

    @Test func theListIsJSONOfTheInstalledExporters() throws {
        let exporters = [
            Plugin(name: "PDF", type: "exporter", ext: "pdf"),
            Plugin(name: "DocX", type: "exporter", filename: "exporter-docx.js", ext: "docx"),
        ]
        let decoded = try JSONDecoder().decode([InstalledExporter].self, from: HeadlessExport.listJSON(for: exporters))
        #expect(decoded == [InstalledExporter(name: "DocX", ext: "docx", filename: "exporter-docx.js")])
    }

    nonisolated private static let pluginSource = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .appendingPathComponent("plugins/exporter-docx/dist/exporter-docx.js")

    /// Needs the DocX plugin built (`npm run build` in plugins/exporter-docx), as the app's own build does.
    @Test(.enabled(if: FileManager.default.fileExists(atPath: HeadlessExportTests.pluginSource.path)))
    func aPluginExporterRunsInAHeadlessViewAndWritesItsFile() async throws {
        let exporter = InstalledExporter(name: "DocX", ext: "docx", filename: "exporter-docx.js")
        let result = try await HeadlessExport().runPlugin(exporter, source: Self.pluginSource, html: "<h1>Title</h1><p>Body text.</p>")
        #expect(result.data.count > 1000, "got \(result.data.count) bytes")
        #expect(result.data.prefix(2) == Data("PK".utf8), "a DOCX file is a zip")
    }

    @Test func aPluginWhoseFileIsMissingFailsClearly() async throws {
        let exporter = InstalledExporter(name: "Gone", ext: "gone", filename: "gone.js")
        let missing = FileManager.default.temporaryDirectory.appendingPathComponent("no-such-\(UUID().uuidString).js")
        await #expect(throws: HeadlessExportError.pluginFileMissing("Gone")) {
            _ = try await HeadlessExport().runPlugin(exporter, source: missing, html: "<p>x</p>")
        }
        #expect(HeadlessExportError.pluginFileMissing("Gone").localizedDescription == "The exporter Gone is installed but its file is missing. Reinstall it from the Plugins tab.")
    }

    @Test func anExporterThatIsNotInstalledSaysSo() {
        let error = HeadlessExportError.notInstalled("odt", [InstalledExporter(name: "DocX", ext: "docx", filename: "exporter-docx.js")])
        #expect(error.localizedDescription == "No exporter named 'odt' is installed. Available formats: html, pdf, DocX.")
    }

    @Test func tightenedHtmlWritesTightLists() async throws {
        let page = HeadlessTestPage()
        await page.start()
        let converted = try await MarkupConverter.importMarkdownDecoded(page.webView, content: "* one\n* two\n  * inner\n\n* three\n\n  more\n")
        let tight = await page.webView.tightenHtml(converted.result)
        #expect(tight == "<ul><li>one</li><li>two<ul><li>inner</li></ul></li><li><p>three</p><p>more</p></li></ul>")
    }
}
