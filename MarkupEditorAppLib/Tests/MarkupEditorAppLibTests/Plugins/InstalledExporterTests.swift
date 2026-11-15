//
//  InstalledExporterTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorAppLib

struct InstalledExporterTests {

    private let exporters = [
        Plugin(name: "HTML", type: "exporter", ext: "html"),
        Plugin(name: "PDF", type: "exporter", ext: "pdf"),
        Plugin(name: "DocX", type: "exporter", filename: "exporter-docx.js", ext: "docx"),
        Plugin(name: "EPUB", type: "exporter", filename: "exporter-epub.js", ext: "epub"),
        Plugin(name: "No Extension", type: "exporter", filename: "exporter-x.js"),
    ]

    @Test func onlyExportersBackedByAFileAndWithAnExtensionAreListed() {
        let installed = InstalledExporter.installed(from: exporters)
        #expect(installed.map(\.name) == ["DocX", "EPUB"])
        #expect(installed.map(\.ext) == ["docx", "epub"])
        #expect(installed.map(\.filename) == ["exporter-docx.js", "exporter-epub.js"])
    }

    @Test func anExporterIsFoundByNameOrExtensionIgnoringCaseAndALeadingDot() {
        let installed = InstalledExporter.installed(from: exporters)
        #expect(InstalledExporter.find("DocX", in: installed)?.name == "DocX")
        #expect(InstalledExporter.find("docx", in: installed)?.name == "DocX")
        #expect(InstalledExporter.find(".EPUB", in: installed)?.name == "EPUB")
        #expect(InstalledExporter.find("epub", in: installed)?.ext == "epub")
    }

    @Test func aNameWinsOverAnotherExportersExtension() {
        let installed = [
            InstalledExporter(name: "markdown", ext: "txt", filename: "a.js"),
            InstalledExporter(name: "Text", ext: "markdown", filename: "b.js"),
        ]
        #expect(InstalledExporter.find("markdown", in: installed)?.filename == "a.js")
    }

    @Test func anUnknownExporterIsNotFound() {
        let installed = InstalledExporter.installed(from: exporters)
        #expect(InstalledExporter.find("odt", in: installed) == nil)
        #expect(InstalledExporter.find("", in: installed) == nil)
        #expect(InstalledExporter.find("html", in: installed) == nil)
    }

    @Test func theListRoundTripsThroughJSON() throws {
        let installed = InstalledExporter.installed(from: exporters)
        let decoded = try JSONDecoder().decode([InstalledExporter].self, from: JSONEncoder().encode(installed))
        #expect(decoded == installed)
    }

    @Test func theNotInstalledMessageListsWhatIsAvailable() {
        let installed = InstalledExporter.installed(from: exporters)
        let message = InstalledExporter.notInstalledMessage("odt", installed: installed)
        #expect(message == "No exporter named 'odt' is installed. Available formats: html, pdf, DocX, EPUB.")
        let none = InstalledExporter.notInstalledMessage("odt", installed: [])
        #expect(none == "No exporter named 'odt' is installed. Available formats: html, pdf.")
    }
}
