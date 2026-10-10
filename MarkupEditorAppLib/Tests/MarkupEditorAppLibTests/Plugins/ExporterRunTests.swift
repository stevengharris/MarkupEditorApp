//
//  ExporterRunTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct ExporterRunDecodingTests {

    @Test func decodesAResultString() {
        #expect(ExporterRun(script: ["result": "{\"result\":\"x\"}"] as [String: Any]) == .result("{\"result\":\"x\"}"))
    }

    @Test func decodesAListOfRegisteredExportersWhenThePluginIsNotRegistered() {
        #expect(ExporterRun(script: ["notRegistered": ["DocX", "PDF"]] as [String: Any]) == .notRegistered(registered: ["DocX", "PDF"]))
        #expect(ExporterRun(script: ["notRegistered": [String]()] as [String: Any]) == .notRegistered(registered: []))
    }

    @Test func treatsEverythingElseAsNoResult() {
        #expect(ExporterRun(script: nil) == .noResult)
        #expect(ExporterRun(script: NSNull()) == .noResult)
        #expect(ExporterRun(script: "a bare string") == .noResult)
        #expect(ExporterRun(script: ["result": NSNull()] as [String: Any]) == .noResult)
        #expect(ExporterRun(script: [String: Any]()) == .noResult)
        #expect(ExporterRun(script: ["notRegistered": "DocX"] as [String: Any]) == .noResult)
    }
}

struct ExporterRunConversionTests {

    private let envelope = #"{"result":"SGk=","warnings":["w"],"metadata":null}"#

    @Test func decodesAResultEnvelope() throws {
        let (data, warnings) = try MarkupConverter.decode(.result(envelope), name: "EPUB")
        #expect(data == Data("Hi".utf8))
        #expect(warnings == ["w"])
    }

    @Test func aPluginThatIsNotRegisteredIsReportedAsSuchNotAsNoResult() {
        #expect(throws: MarkupConversionError.pluginNotRegistered(name: "EPUB", registered: ["DocX"])) {
            try MarkupConverter.decode(.notRegistered(registered: ["DocX"]), name: "EPUB")
        }
    }

    @Test func noResultStaysNoResult() {
        #expect(throws: MarkupConversionError.pluginReturnedNoResult("EPUB")) {
            try MarkupConverter.decode(.noResult, name: "EPUB")
        }
    }

    @Test func aMalformedEnvelopeStillReportsThePluginsProblem() {
        #expect(throws: MarkupConversionError.self) { try MarkupConverter.decode(.result("not json"), name: "EPUB") }
    }
}

struct PluginNotRegisteredMessageTests {

    @Test func namesThePluginAndTheRegisteredExporters() {
        let message = MarkupConversionError.pluginNotRegistered(name: "EPUB", registered: ["DocX", "PDF"]).errorDescription
        #expect(message == "Plugin 'EPUB' is not registered with the editor. Registered exporters: DocX, PDF.")
    }

    @Test func saysSoWhenNoExporterIsRegistered() {
        let message = MarkupConversionError.pluginNotRegistered(name: "EPUB", registered: []).errorDescription
        #expect(message == "Plugin 'EPUB' is not registered with the editor. No exporters are registered.")
    }

    @Test func isDistinctFromTheNoResultMessage() {
        #expect(MarkupConversionError.pluginNotRegistered(name: "X", registered: []).errorDescription
                != MarkupConversionError.pluginReturnedNoResult("X").errorDescription)
    }
}
