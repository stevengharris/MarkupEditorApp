//
//  ExporterManagerTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorAppLib

// Computed: Plugin is not Sendable, so a global constant of it is rejected under strict concurrency.
private var html: Plugin { ExporterManager.BuiltIn.html.plugin }
private var pdf: Plugin { ExporterManager.BuiltIn.pdf.plugin }
private var docx: Plugin { ExporterManager.docx }
private var epub: Plugin { Plugin(name: "EPUB", type: "exporter", filename: "exporter-epub.js", ext: "epub") }

struct ExporterManagerTests {

    @Test func builtInsLeadInOrderHtmlThenPdf() {
        #expect(ExporterManager.ensureBuiltIns([]) == [html, pdf])
    }

    @Test func builtInsHaveNoFileAndTheirExtension() {
        #expect(html.filename == nil && html.ext == "html")
        #expect(pdf.filename == nil && pdf.ext == "pdf")
    }

    @Test func listSavedBeforeHtmlExistedGainsItAheadOfPdf() {
        #expect(ExporterManager.ensureBuiltIns([pdf, docx]) == [html, pdf, docx])
    }

    @Test func installedExportersKeepTheirOrderAfterTheBuiltIns() {
        #expect(ExporterManager.ensureBuiltIns([epub, docx]) == [html, pdf, epub, docx])
        #expect(ExporterManager.ensureBuiltIns([docx, pdf, epub, html]) == [html, pdf, docx, epub])
    }

    @Test func ensuringBuiltInsIsIdempotent() {
        let once = ExporterManager.ensureBuiltIns([docx])
        #expect(ExporterManager.ensureBuiltIns(once) == once)
    }

    @Test func aFileBackedExporterSharingABuiltInNameIsNotABuiltIn() {
        let fileBackedHtml = Plugin(name: "HTML", type: "exporter", filename: "exporter-html.js", ext: "html")
        #expect(ExporterManager.builtIn(fileBackedHtml) == nil)
        #expect(ExporterManager.builtIn(html) == .html)
        #expect(ExporterManager.builtIn(pdf) == .pdf)
    }

    @Test func menuHasNoSeparatorWhenOnlyBuiltInsExist() {
        #expect(ExporterManager.menuLayout(for: [html, pdf]) == [html, pdf])
    }

    @Test func menuSeparatesTheBuiltInsFromInstalledExporters() {
        #expect(ExporterManager.menuLayout(for: [html, pdf, docx]) == [html, pdf, nil, docx])
        #expect(ExporterManager.menuLayout(for: [html, pdf, docx, epub]) == [html, pdf, nil, docx, epub])
    }
}
