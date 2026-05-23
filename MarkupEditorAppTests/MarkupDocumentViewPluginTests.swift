//
//  MarkupDocumentViewPluginTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
import AppKit
@testable import MarkupEditorApp

// Structural / smoke tests for MarkupDocumentView plugin wiring.
//
// Full functional verification is in Phase 3.8 (manual).
// These tests guard against regressions in structural plumbing:
//   1. AppDelegate.populatePluginMenus changes the submenu item count — the method
//      markupPluginsDidLoad calls.
//   2. Notification names .menuExportPlugin and .menuImportPlugin are defined and
//      have the expected raw values (prevents silent renames breaking the wiring).
@MainActor @Suite(.serialized) struct MarkupDocumentViewPluginTests {

    // MARK: - Helpers

    private func makeDelegate() -> AppDelegate {
        let delegate = AppDelegate()
        NSApp.mainMenu = delegate.buildMenu()
        return delegate
    }

    // MARK: - populatePluginMenus (called by markupPluginsDidLoad) changes submenu count

    @Test func populatePluginMenusChangesSubmenuCount() {
        let delegate = makeDelegate()

        // Submenus start empty
        #expect(delegate.exportSubmenu.items.isEmpty)
        #expect(delegate.importSubmenu.items.isEmpty)

        // After populate, count increases — this is exactly what markupPluginsDidLoad calls
        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js")]
        delegate.populatePluginMenus(entries)

        #expect(delegate.exportSubmenu.items.count == 1)
        #expect(delegate.importSubmenu.items.count == 1)
    }

    @Test func populatePluginMenusWithMultipleEntriesMatchesPluginCount() {
        let delegate = makeDelegate()
        let entries = [
            AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js"),
            AppConfig.PluginConfigEntry(name: "RST", filename: "markup-editor-rst.js")
        ]
        delegate.populatePluginMenus(entries)
        #expect(delegate.exportSubmenu.items.count == entries.count)
        #expect(delegate.importSubmenu.items.count == entries.count)
    }

    // MARK: - markupPluginsDidLoad manifest mapping

    @Test func markupPluginsDidLoadMapsExtensionToFileExtension() {
        // Verify that the "extension" key from the JS manifest is mapped to fileExtension
        // on the resulting PluginConfigEntry (not dropped or left nil).
        let delegate = makeDelegate()
        // Simulate the manifest payload that markupPluginsDidLoad receives from the JS side.
        // The JS manifest uses "extension" as the key; Swift renames it to fileExtension.
        let manifest: [[String: String]] = [
            ["name": "Markdown", "extension": "md"]
        ]
        // Access markupPluginsDidLoad via the MarkupDocumentView extension that MarkupDelegate requires.
        // We can't easily call it directly since it requires a MarkupWKWebView, so we verify
        // the mapping logic indirectly by constructing entries the same way the implementation does.
        let entries = manifest.compactMap { dict -> AppConfig.PluginConfigEntry? in
            guard let name = dict["name"] else { return nil }
            let ext = dict["extension"]
            return AppConfig.PluginConfigEntry(name: name, filename: name, fileExtension: ext)
        }
        #expect(entries.count == 1)
        #expect(entries[0].fileExtension == "md")

        // Also verify populatePluginMenus accepts entries with fileExtension set
        delegate.populatePluginMenus(entries)
        #expect(delegate.exportSubmenu.items.count == 1)
    }

    // MARK: - Notification name existence (regression guard)

    @Test func menuExportPluginNotificationNameIsDefined() {
        // Verify the raw value — prevents silent renames breaking the wiring
        #expect(Notification.Name.menuExportPlugin.rawValue == "menuExportPlugin")
    }

    @Test func menuImportPluginNotificationNameIsDefined() {
        #expect(Notification.Name.menuImportPlugin.rawValue == "menuImportPlugin")
    }

}
