//
//  ImportExportValueTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor
struct ImportExportValueDecodeTests {

    @Test func decodesARealisticSuccessEnvelope() {
        let base64 = Data("PK\u{03}\u{04} not a real docx, just base64-shaped bytes".utf8).base64EncodedString()
        let json = """
        {"result":"\(base64)","warnings":["<img> with an unresolved src is not embeddable"],"metadata":null}
        """
        let value = ImportExportValue.decode(from: json)
        #expect(value?.result == base64)
        #expect(value?.warnings == ["<img> with an unresolved src is not embeddable"])
        #expect(value?.metadata == nil)
    }

    @Test func decodesAFailureEnvelopeWithNilResultAndNonEmptyWarnings() {
        let json = """
        {"result":null,"warnings":["DOCX conversion failed: boom"],"metadata":null}
        """
        let value = ImportExportValue.decode(from: json)
        #expect(value?.result == nil)
        #expect(value?.warnings == ["DOCX conversion failed: boom"])
    }

    @Test func decodesASuccessEnvelopeWithNoWarnings() {
        let json = """
        {"result":"aGVsbG8=","warnings":[],"metadata":null}
        """
        let value = ImportExportValue.decode(from: json)
        #expect(value?.result == "aGVsbG8=")
        #expect(value?.warnings.isEmpty == true)
    }

    @Test func malformedJSONDecodesToNilWithoutCrashing() {
        #expect(ImportExportValue.decode(from: "{not valid json") == nil)
        #expect(ImportExportValue.decode(from: "") == nil)
        #expect(ImportExportValue.decode(from: "null") == nil)
    }

    @Test func nilInputStringDecodesToNil() {
        #expect(ImportExportValue.decode(from: nil) == nil)
    }

    @Test func envelopeMissingARequiredKeyDecodesToNil() {
        // `warnings` is non-optional -- an envelope that drops the key entirely (a real risk if
        // the JS side's contract ever drifts) must fail to decode, not silently default to [].
        let json = """
        {"result":"aGVsbG8=","metadata":null}
        """
        #expect(ImportExportValue.decode(from: json) == nil)
    }
}

@MainActor
struct Base64BinaryRoundTripTests {

    @Test func roundTripsAKnownByteSequenceExactly() {
        let bytes = Data([0, 1, 2, 253, 254, 255])
        let encoded = bytes.base64EncodedString()
        #expect(Data(base64Encoded: encoded) == bytes)
    }

    @Test func roundTripsADocumentSizedPayloadByteExact() {
        // Sized to represent a real exported .docx (demo.docx decoded to ~94KB during ky63.22's
        // real-app verification), well past any trivial single-block encode/decode path.
        let size = 300_000
        var bytes = [UInt8](repeating: 0, count: size)
        for i in 0..<size { bytes[i] = UInt8(i % 256) }
        let data = Data(bytes)
        let encoded = data.base64EncodedString()
        let decoded = Data(base64Encoded: encoded)
        #expect(decoded == data)
    }

    @Test func decodesThroughTheFullEnvelopeForARealisticBinaryResult() {
        let size = 50_000
        var bytes = [UInt8](repeating: 0, count: size)
        for i in 0..<size { bytes[i] = UInt8((i * 7) % 256) }
        let data = Data(bytes)
        let base64 = data.base64EncodedString()
        let json = """
        {"result":"\(base64)","warnings":[],"metadata":null}
        """
        let value = ImportExportValue.decode(from: json)
        let outputData = value?.result.flatMap { Data(base64Encoded: $0) }
        #expect(outputData == data)
    }
}

@MainActor
struct DecodeExportOutputTests {

    @Test func returnsDataAndWarningsOnSuccess() throws {
        let base64 = Data("real bytes".utf8).base64EncodedString()
        let json = """
        {"result":"\(base64)","warnings":["a non-fatal advisory"],"metadata":null}
        """
        let (data, warnings) = try ImportExportValue.decodeExportOutput(from: json, pluginName: "DocX")
        #expect(data == Data("real bytes".utf8))
        #expect(warnings == ["a non-fatal advisory"])
    }

    @Test func throwsUndecodableResultOnMalformedJSON() {
        #expect {
            try ImportExportValue.decodeExportOutput(from: "{not valid json", pluginName: "DocX")
        } throws: { error in
            guard case .pluginReturnedUndecodableResult(let name, _) = error as? MarkupDocumentError else { return false }
            return name == "DocX"
        }
    }

    @Test func throwsProducedEmptyResultCarryingTheFailureReasonWhenResultIsNil() {
        let json = """
        {"result":null,"warnings":["DOCX conversion failed: boom"],"metadata":null}
        """
        #expect {
            try ImportExportValue.decodeExportOutput(from: json, pluginName: "DocX")
        } throws: { error in
            guard case .pluginProducedEmptyResult(let name, let reason) = error as? MarkupDocumentError else { return false }
            return name == "DocX" && reason == "DOCX conversion failed: boom"
        }
    }

    @Test func throwsReturnedInvalidResultWhenResultIsNotValidBase64() {
        let json = """
        {"result":"not valid base64!!","warnings":[],"metadata":null}
        """
        #expect {
            try ImportExportValue.decodeExportOutput(from: json, pluginName: "DocX")
        } throws: { error in
            guard case .pluginReturnedInvalidResult(let name) = error as? MarkupDocumentError else { return false }
            return name == "DocX"
        }
    }

    // Regression: Data(base64Encoded: "") decodes to Optional(0 bytes), not nil -- an
    // empty-string `result` must not be silently treated as a successful, empty export.
    @Test func throwsProducedEmptyResultWhenResultIsAnEmptyString() {
        let json = """
        {"result":"","warnings":[],"metadata":null}
        """
        #expect {
            try ImportExportValue.decodeExportOutput(from: json, pluginName: "DocX")
        } throws: { error in
            guard case .pluginProducedEmptyResult(let name, _) = error as? MarkupDocumentError else { return false }
            return name == "DocX"
        }
    }
}
