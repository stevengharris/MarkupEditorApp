//
//  PluginReconciliationTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorAppLib

// Computed: Plugin is not Sendable, so a global constant of it is rejected under strict concurrency.
private var docx: Plugin { Plugin(name: "DocX", type: "exporter", filename: "exporter-docx.js", ext: "docx") }
private var pdf: Plugin { Plugin(name: "PDF", type: "exporter", ext: "pdf") }
private var mermaid: Plugin { Plugin(name: "Mermaid", type: "codeview", filename: "codeview-mermaid.js") }
private var metadata: Plugin { Plugin(name: "Metadata", type: "codeview", filename: "codeview-metadata.js") }
private let registeredDocx = ["name": "DocX", "type": "exporter", "ext": "docx"]
private let registeredMermaid = ["name": "Mermaid", "type": "codeview"]

struct PluginReconciliationTests {

    @Test func findsNothingWhenEveryRecordedPluginIsRegistered() {
        let problems = PluginReconciliation.problems(recordedExporters: [pdf, docx], recordedCodeViews: [mermaid, metadata], registered: [registeredDocx, registeredMermaid])
        #expect(problems == [])
    }

    @Test func ignoresPluginsNotBackedByAFile() {
        // The built-in PDF exporter never registers a JS plugin.
        #expect(PluginReconciliation.problems(recordedExporters: [pdf], recordedCodeViews: [], registered: []) == [])
    }

    @Test func ignoresProtectedInternalCodeViews() {
        // Internal codeviews load but never register.
        #expect(PluginReconciliation.problems(recordedExporters: [], recordedCodeViews: [metadata], registered: []) == [])
    }

    @Test func reportsARecordedPluginTheEditorHasNoRegistrationFor() {
        let epub = Plugin(name: "EPUB", type: "exporter", filename: "exporter-epub.js", ext: "epub")
        let problems = PluginReconciliation.problems(recordedExporters: [docx, epub], recordedCodeViews: [], registered: [registeredDocx])
        #expect(problems == [.notRegistered(name: "EPUB", kind: "exporter", registered: ["DocX"])])
    }

    @Test func reportsANameRegisteredWithADifferentCase() {
        let epub = Plugin(name: "epub", type: "exporter", filename: "exporter-epub.js", ext: "epub")
        let registered = [["name": "EPUB", "type": "exporter", "ext": "epub"]]
        let problems = PluginReconciliation.problems(recordedExporters: [epub], recordedCodeViews: [], registered: registered)
        #expect(problems == [
            .notRegistered(name: "epub", kind: "exporter", registered: ["EPUB"]),
            .unrecorded(name: "EPUB", kind: "exporter"),
        ])
    }

    @Test func reportsARegisteredPluginTheSettingsDoNotKnowAbout() {
        let problems = PluginReconciliation.problems(recordedExporters: [], recordedCodeViews: [], registered: [registeredDocx])
        #expect(problems == [.unrecorded(name: "DocX", kind: "exporter")])
    }

    @Test func reportsAnExtensionThatDiffersFromTheRegisteredOne() {
        let recorded = Plugin(name: "DocX", type: "exporter", filename: "exporter-docx.js", ext: "doc")
        let problems = PluginReconciliation.problems(recordedExporters: [recorded], recordedCodeViews: [], registered: [registeredDocx])
        #expect(problems == [.extensionMismatch(name: "DocX", recorded: "doc", registered: "docx")])
    }

    @Test func aRegisteredCodeviewIsNotConfusedWithAnExporterOfTheSameName() {
        let clash = Plugin(name: "Mermaid", type: "exporter", filename: "exporter-mermaid.js", ext: "m")
        let problems = PluginReconciliation.problems(recordedExporters: [clash], recordedCodeViews: [], registered: [registeredMermaid])
        #expect(problems == [
            .notRegistered(name: "Mermaid", kind: "exporter", registered: []),
            .unrecorded(name: "Mermaid", kind: "codeview"),
        ])
    }

    @Test func skipsRegisteredEntriesWithoutANameOrType() {
        let problems = PluginReconciliation.problems(recordedExporters: [], recordedCodeViews: [], registered: [["type": "exporter"], ["name": "X"], [:]])
        #expect(problems == [])
    }

    @Test func problemsDescribeThemselvesForTheLog() {
        #expect(PluginReconciliation.Problem.notRegistered(name: "EPUB", kind: "exporter", registered: ["DocX"]).description
                == "exporter 'EPUB' is in Settings but the editor has no such registered plugin (registered exporters: DocX)")
        #expect(PluginReconciliation.Problem.unrecorded(name: "epub", kind: "exporter").description
                == "exporter 'epub' is registered with the editor but is not in Settings")
        #expect(PluginReconciliation.Problem.extensionMismatch(name: "DocX", recorded: "doc", registered: nil).description
                == "exporter 'DocX' has extension 'doc' in Settings but registers none")
    }
}
