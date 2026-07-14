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
        {"focusAfterLoad":true,"selectImage":false,"insertLink":true,"insertImage":true}
        """
        let result = try #require(MarkupDocumentView.decodeConfig(BehaviorConfig.self, from: json))
        #expect(result.focusAfterLoad == true)
        #expect(result.selectImage == false)
        #expect(result.insertLink == true)
        #expect(result.insertImage == true)
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

// Tests for AppConfig.PluginConfigEntry decoding and the `plugins` optional property.
@MainActor
struct AppConfigPluginDecodingTests {

    // MARK: - plugins present: decodes entry correctly

    @Test func pluginsArrayDecodesMarkdownEntry() throws {
        let json = """
        {
            "toolbarVisibility": "toggled",
            "toggledState": "visible",
            "plugins": [{ "name": "Markdown", "filename": "markupeditor-markdown.js" }]
        }
        """
        let data = try #require(json.data(using: .utf8))
        let config = try JSONDecoder().decode(AppConfig.self, from: data)
        let plugins = try #require(config.plugins)
        #expect(plugins.count == 1)
        #expect(plugins[0].name == "Markdown")
        #expect(plugins[0].filename == "markupeditor-markdown.js")
    }

    // MARK: - plugins key absent: backward compatible → nil

    @Test func pluginsAbsentDecodesAsNil() throws {
        let json = """
        { "toolbarVisibility": "toggled", "toggledState": "visible" }
        """
        let data = try #require(json.data(using: .utf8))
        let config = try JSONDecoder().decode(AppConfig.self, from: data)
        #expect(config.plugins == nil)
    }

    // MARK: - plugins present but empty array

    @Test func pluginsEmptyArrayDecodes() throws {
        let json = """
        { "toolbarVisibility": "toggled", "toggledState": "visible", "plugins": [] }
        """
        let data = try #require(json.data(using: .utf8))
        let config = try JSONDecoder().decode(AppConfig.self, from: data)
        let plugins = try #require(config.plugins)
        #expect(plugins.isEmpty)
    }

    // MARK: - fileExtension field on PluginConfigEntry

    @Test func testFileExtensionDecodesFromJSON() throws {
        let json = """
        { "name": "X", "filename": "x.js", "fileExtension": "md" }
        """
        let data = try #require(json.data(using: .utf8))
        let entry = try JSONDecoder().decode(AppConfig.PluginConfigEntry.self, from: data)
        #expect(entry.fileExtension == "md")
    }

    @Test func testFileExtensionIsNilWhenKeyAbsent() throws {
        let json = """
        { "name": "X", "filename": "x.js" }
        """
        let data = try #require(json.data(using: .utf8))
        let entry = try JSONDecoder().decode(AppConfig.PluginConfigEntry.self, from: data)
        #expect(entry.fileExtension == nil)
    }

}
