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

    // MARK: - Notification name existence (regression guard)

    @Test func menuExportPluginNotificationNameIsDefined() {
        // Verify the raw value — prevents silent renames breaking the wiring
        #expect(Notification.Name.menuExportPlugin.rawValue == "menuExportPlugin")
    }

    @Test func menuImportPluginNotificationNameIsDefined() {
        #expect(Notification.Name.menuImportPlugin.rawValue == "menuImportPlugin")
    }
}
