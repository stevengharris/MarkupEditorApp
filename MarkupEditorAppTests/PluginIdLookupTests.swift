//
//  PluginIdLookupTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

// Tests for pluginId(forExtension:in:) — the lookup helper that maps a file extension
// to the plugin's JS registry key (its `name`).
//
// These tests guard the no-hardcoded-name invariant: the system must derive the plugin
// identifier purely from PluginConfigEntry.fileExtension, not from a hardcoded string.
//
// Testability boundary: openDocument, openMarkdown, handleSave (.md), and showSavePanel
// (.md) all require a live MarkupWKWebView and async plugin dispatch for full end-to-end
// verification.  Those code paths are unit-testable only at the pluginId lookup level;
// the integration layer is verified manually (Phase 3.8 manual testing protocol).
struct PluginIdLookupTests {

    // MARK: - Known extension

    @Test func pluginIdForMdReturnsPluginName() {
        let config = AppConfig(
            toolbarVisibility: "toggled",
            toggledState: "visible",
            plugins: [
                AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js", fileExtension: "md")
            ]
        )
        let result = pluginId(forExtension: "md", in: config)
        #expect(result == "Markdown")
    }

    @Test func pluginIdIsCaseSensitiveOnExtension() {
        // The lookup uses literal string equality; callers are expected to lowercase beforehand.
        let config = AppConfig(
            toolbarVisibility: "toggled",
            toggledState: "visible",
            plugins: [
                AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js", fileExtension: "md")
            ]
        )
        // "MD" (uppercase) should NOT match the "md" fileExtension entry.
        let result = pluginId(forExtension: "MD", in: config)
        #expect(result == nil)
    }

    // MARK: - Unknown extension

    @Test func pluginIdForUnknownExtensionReturnsNil() {
        let config = AppConfig(
            toolbarVisibility: "toggled",
            toggledState: "visible",
            plugins: [
                AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js", fileExtension: "md")
            ]
        )
        let result = pluginId(forExtension: "xyz", in: config)
        #expect(result == nil)
    }

    @Test func pluginIdWithNoPluginsReturnsNil() {
        let config = AppConfig(toolbarVisibility: "toggled", toggledState: "visible", plugins: nil)
        let result = pluginId(forExtension: "md", in: config)
        #expect(result == nil)
    }

    @Test func pluginIdWithEmptyPluginsReturnsNil() {
        let config = AppConfig(toolbarVisibility: "toggled", toggledState: "visible", plugins: [])
        let result = pluginId(forExtension: "md", in: config)
        #expect(result == nil)
    }

    // MARK: - Multiple plugins

    @Test func pluginIdSelectsCorrectPluginAmongMultiple() {
        let config = AppConfig(
            toolbarVisibility: "toggled",
            toggledState: "visible",
            plugins: [
                AppConfig.PluginConfigEntry(name: "RST", filename: "markup-editor-rst.js", fileExtension: "rst"),
                AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js", fileExtension: "md")
            ]
        )
        #expect(pluginId(forExtension: "md", in: config) == "Markdown")
        #expect(pluginId(forExtension: "rst", in: config) == "RST")
    }

    // MARK: - Nil fileExtension entry

    @Test func pluginIdSkipsEntriesWithNilFileExtension() {
        // Entries created from older appconfig.json may have fileExtension == nil.
        // These should never match any extension lookup.
        let config = AppConfig(
            toolbarVisibility: "toggled",
            toggledState: "visible",
            plugins: [
                AppConfig.PluginConfigEntry(name: "Legacy", filename: "legacy.js", fileExtension: nil)
            ]
        )
        let result = pluginId(forExtension: "md", in: config)
        #expect(result == nil)
    }

}
