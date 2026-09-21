//
//  PluginAddCheckTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorAppLib

// Computed: Plugin is not Sendable, so a global constant of it is rejected under strict concurrency.
private var docx: Plugin { Plugin(name: "DocX", type: "exporter", filename: "exporter-docx.js", ext: "docx") }
private var mermaid: Plugin { Plugin(name: "Mermaid", type: "codeview", filename: "codeview-mermaid.js") }
private let epubBanner = PluginBanner(name: "EPUB", kind: .exporter, ext: "epub")
private let viewBanner = PluginBanner(name: "GeoJSON", kind: .codeview, ext: nil)

struct PluginAddCheckTests {

    @Test func allowsANewPlugin() throws {
        try PluginAddCheck.validate(epubBanner, filename: "exporter-epub.js", expected: .exporter, exporters: [docx], codeViews: [mermaid])
        try PluginAddCheck.validate(viewBanner, filename: "codeview-geojson.js", expected: .codeview, exporters: [docx], codeViews: [mermaid])
    }

    @Test func allowsReplacingAPluginWithTheSameNameAndFile() throws {
        let sameDocx = PluginBanner(name: "DocX", kind: .exporter, ext: "docx")
        try PluginAddCheck.validate(sameDocx, filename: "exporter-docx.js", expected: .exporter, exporters: [docx], codeViews: [mermaid])
    }

    @Test func expectedKindIsOptional() throws {
        try PluginAddCheck.validate(epubBanner, filename: "exporter-epub.js", expected: nil, exporters: [], codeViews: [])
    }

    @Test func refusesABannerWhoseKindIsNotTheOneBeingAdded() {
        #expect(throws: PluginAddError.wrongKind(expected: .codeview, found: .exporter)) {
            try PluginAddCheck.validate(epubBanner, filename: "exporter-epub.js", expected: .codeview, exporters: [], codeViews: [])
        }
    }

    @Test(arguments: CodeViewManager.protectedNames.sorted())
    func refusesAProtectedNameForEitherKind(name: String) {
        let asView = PluginBanner(name: name, kind: .codeview, ext: nil)
        let asExporter = PluginBanner(name: name, kind: .exporter, ext: "x")
        #expect(throws: PluginAddError.protectedName(name)) {
            try PluginAddCheck.validate(asView, filename: "codeview-other.js", expected: nil, exporters: [], codeViews: [])
        }
        #expect(throws: PluginAddError.protectedName(name)) {
            try PluginAddCheck.validate(asExporter, filename: "exporter-other.js", expected: nil, exporters: [], codeViews: [])
        }
    }

    @Test func refusesANameAlreadyUsedByADifferentFile() {
        let banner = PluginBanner(name: "DocX", kind: .exporter, ext: "docx")
        #expect(throws: PluginAddError.nameInUse("DocX")) {
            try PluginAddCheck.validate(banner, filename: "renamed-docx.js", expected: nil, exporters: [docx], codeViews: [])
        }
    }

    @Test func refusesANameUsedByAPluginOfTheOtherKind() {
        // The editor's plugin registry is keyed by name across kinds, so this would replace DocX.
        let banner = PluginBanner(name: "DocX", kind: .codeview, ext: nil)
        #expect(throws: PluginAddError.nameInUse("DocX")) {
            try PluginAddCheck.validate(banner, filename: "exporter-docx.js", expected: nil, exporters: [docx], codeViews: [])
        }
    }

    @Test func comparesFilenamesCaseInsensitivelyBecauseTheVolumeDoes() {
        let banner = PluginBanner(name: "Other", kind: .exporter, ext: "o")
        #expect(throws: PluginAddError.filenameInUse("Exporter-DocX.js", plugin: "DocX")) {
            try PluginAddCheck.validate(banner, filename: "Exporter-DocX.js", expected: nil, exporters: [docx], codeViews: [])
        }
    }

    @Test func allowsReplacingAPluginWhenTheFilenameDiffersOnlyInCase() throws {
        let sameDocx = PluginBanner(name: "DocX", kind: .exporter, ext: "docx")
        try PluginAddCheck.validate(sameDocx, filename: "Exporter-DocX.js", expected: nil, exporters: [docx], codeViews: [])
    }

    @Test func keepsNamesCaseSensitiveBecauseTheEditorsRegistryIs() throws {
        let lower = PluginBanner(name: "docx", kind: .exporter, ext: "docx")
        try PluginAddCheck.validate(lower, filename: "exporter-docx-lower.js", expected: nil, exporters: [docx], codeViews: [])
    }

    @Test func treatsABuiltInPluginsNameAsReservedNotAsSomethingToDelete() {
        let pdf = Plugin(name: "PDF", type: "exporter", ext: "pdf")
        let banner = PluginBanner(name: "PDF", kind: .exporter, ext: "pdf")
        #expect(throws: PluginAddError.protectedName("PDF")) {
            try PluginAddCheck.validate(banner, filename: "exporter-pdf.js", expected: nil, exporters: [pdf], codeViews: [])
        }
    }

    @Test func refusesAFileAlreadyBackingADifferentPlugin() {
        let banner = PluginBanner(name: "Other", kind: .exporter, ext: "o")
        #expect(throws: PluginAddError.filenameInUse("exporter-docx.js", plugin: "DocX")) {
            try PluginAddCheck.validate(banner, filename: "exporter-docx.js", expected: nil, exporters: [docx], codeViews: [])
        }
    }

    @Test func errorsDescribeThemselvesForTheUser() {
        #expect(PluginAddError.protectedName("Metadata").errorDescription?.contains("Metadata") == true)
        #expect(PluginAddError.nameInUse("DocX").errorDescription?.contains("DocX") == true)
        #expect(PluginAddError.filenameInUse("a.js", plugin: "DocX").errorDescription?.contains("a.js") == true)
        #expect(PluginAddError.wrongKind(expected: .codeview, found: .exporter).errorDescription?.contains("exporter") == true)
        #expect(PluginAddError.wrongKind(expected: .exporter, found: .codeview).errorDescription == "This file is a codeview, not an exporter. Use the add button for codeviews.")
    }
}
