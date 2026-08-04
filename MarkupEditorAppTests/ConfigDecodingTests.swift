//
//  ConfigDecodingTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp
import MarkupEditor

// Tests for MarkupDocumentView.decodeConfig — the persistence-critical path that reads
// @AppStorage JSON and injects it into MarkupWKWebViewConfiguration.
//
// The nil-return contract is load-bearing: nil means "no override stored, use
// package bundle defaults." An empty-struct fallback would silently zero out
// config and override the bundle defaults, which is wrong.
@MainActor
struct ConfigDecodingTests {

    // MARK: - Empty / missing input

    @Test func emptyStringReturnsNil() {
        #expect(MarkupDocumentView.decodeConfig(BehaviorConfig.self, from: "") == nil)
    }

    @Test func emptyStringReturnsNilForKeymap() {
        #expect(MarkupDocumentView.decodeConfig(KeymapConfig.self, from: "") == nil)
    }

    // MARK: - Invalid JSON

    @Test func invalidJSONReturnsNil() {
        #expect(MarkupDocumentView.decodeConfig(BehaviorConfig.self, from: "not json") == nil)
    }

    @Test func jsonStringInsteadOfObjectReturnsNil() {
        #expect(MarkupDocumentView.decodeConfig(BehaviorConfig.self, from: "\"just a string\"") == nil)
    }

    @Test func truncatedJSONReturnsNil() {
        #expect(MarkupDocumentView.decodeConfig(BehaviorConfig.self, from: "{\"focusAfterLoad\":") == nil)
    }

    // MARK: - Valid BehaviorConfig

    @Test func validBehaviorConfigJSONDecodes() throws {
        let json = """
        {"focusAfterLoad":true,"selectImage":false,"insertLink":true,"insertImage":true,"highlightCode":false}
        """
        let result = try #require(MarkupDocumentView.decodeConfig(BehaviorConfig.self, from: json))
        #expect(result.focusAfterLoad == true)
        #expect(result.selectImage == false)
        #expect(result.insertLink == true)
        #expect(result.insertImage == true)
        #expect(result.highlightCode == false)
    }

    @Test func behaviorConfigMissingFieldReturnsNil() {
        // BehaviorConfig has no optional fields; missing any key → decode failure → nil
        let json = """
        {"focusAfterLoad":true}
        """
        #expect(MarkupDocumentView.decodeConfig(BehaviorConfig.self, from: json) == nil)
    }

    // MARK: - Valid KeymapConfig

    @Test func validKeymapConfigJSONDecodes() throws {
        let json = """
        {"bold":"Mod-b","italic":"Mod-i"}
        """
        let result = try #require(MarkupDocumentView.decodeConfig(KeymapConfig.self, from: json))
        #expect(result.bindings["bold"]?.first?.spec == "Mod-b")
        #expect(result.bindings["italic"]?.first?.spec == "Mod-i")
    }

    @Test func emptyKeymapObjectDecodes() throws {
        // KeymapConfig uses a custom decoder that iterates available keys, so {} is valid
        let result = try #require(MarkupDocumentView.decodeConfig(KeymapConfig.self, from: "{}"))
        #expect(result.bindings.isEmpty)
    }

    @Test func keymapArrayBindingDecodes() throws {
        let json = """
        {"bold":["Mod-b","Ctrl-b"]}
        """
        let result = try #require(MarkupDocumentView.decodeConfig(KeymapConfig.self, from: json))
        #expect(result.bindings["bold"]?.count == 2)
        #expect(result.bindings["bold"]?.first?.spec == "Mod-b")
    }

    // MARK: - Nil contract (no empty-struct fallback)

    @Test func nilOnFailureNotEmptyStruct() {
        // Confirm the return is nil (not an empty BehaviorConfig with all-false fields)
        // on a bad input. This guards against the wrong fix of returning .empty() instead.
        let result = MarkupDocumentView.decodeConfig(BehaviorConfig.self, from: "bad")
        #expect(result == nil)
    }
}

// Tests for AppConfig's encode(to:) / init(from:) round trip. AppConfig is an @Observable
// class, whose macro renames stored properties to `_propertyName` and adds
// `_$observationRegistrar`; a synthesized Encodable conformance would serialize those instead
// of the public property names, producing JSON that init(from:) can't decode back. encode(to:)
// is hand-written to guard against that regression.
@MainActor
struct AppConfigRoundTripTests {

    @Test func roundTripPreservesAllFieldsThroughEncodeAndDecode() throws {
        let original = AppConfig(
            toolbarVisibility: "hidden",
            toggledState: "hidden",
            exporters: [Plugin(name: "Markdown", type: "exporter", filename: "markupeditor-markdown.js")],
            codeViews: [Plugin(name: "Mermaid", type: "codeview", filename: "markupeditor-codeview-mermaid.js")]
        )

        let json = try #require(original.asJSON())
        #expect(!json.contains("_$observationRegistrar"))
        #expect(!json.contains("_toolbarVisibility"))

        let data = try #require(json.data(using: .utf8))
        let decoded = try JSONDecoder().decode(AppConfig.self, from: data)

        #expect(decoded.toolbarVisibility == original.toolbarVisibility)
        #expect(decoded.toggledState == original.toggledState)
        #expect(decoded.exporters == original.exporters)
        #expect(decoded.codeViews.first?.name == original.codeViews.first?.name)
        #expect(decoded.codeViews.first?.filename == original.codeViews.first?.filename)
    }

}
