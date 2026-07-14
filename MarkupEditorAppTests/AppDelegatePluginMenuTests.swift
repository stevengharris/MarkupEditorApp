//
//  AppDelegatePluginMenuTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
import AppKit
@testable import MarkupEditorApp

// Tests for AppDelegate plugin menu construction.
//
// AppDelegate.buildMenu() creates an Export submenu under File.
// AppDelegate.populatePluginMenus(_:) fills that submenu from a manifest.
//
// All tests run on the main actor because AppDelegate and NSMenu require it.
@MainActor @Suite(.serialized) struct AppDelegatePluginMenuTests {

    // MARK: - Helpers

    private func makeDelegate() -> AppDelegate {
        let delegate = AppDelegate()
        NSApp.mainMenu = delegate.buildMenu()
        return delegate
    }

    private func fileMenu(from mainMenu: NSMenu) -> NSMenu? {
        mainMenu.items.first(where: { $0.submenu?.title == "File" })?.submenu
    }

    // MARK: - buildMenu creates Export submenu

    @Test func buildMenuCreatesExportItemInFileMenu() {
        _ = makeDelegate()
        let fileMenu = fileMenu(from: NSApp.mainMenu!)
        let exportItem = fileMenu?.items.first(where: { $0.title == "Export" })
        #expect(exportItem != nil)
        #expect(exportItem?.submenu != nil)
        #expect(exportItem?.submenu?.items.isEmpty == true)
    }

    @Test func exportSubmenuIsStoredAsProperty() {
        let delegate = makeDelegate()
        #expect(delegate.exportSubmenu.items.isEmpty)
    }

    // MARK: - populatePluginMenus fills exportSubmenu

    @Test func populatePluginMenusAddsOneItemToExportSubmenu() {
        let delegate = makeDelegate()
        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markupeditor-markdown.js")]
        delegate.populatePluginMenus(entries)
        #expect(delegate.exportSubmenu.items.count == 1)
        #expect(delegate.exportSubmenu.items[0].title == "Markdown")
    }

    @Test func populatePluginMenusAddsMultipleItems() {
        let delegate = makeDelegate()
        let entries = [
            AppConfig.PluginConfigEntry(name: "Markdown", filename: "markupeditor-markdown.js"),
            AppConfig.PluginConfigEntry(name: "RST", filename: "markup-editor-rst.js")
        ]
        delegate.populatePluginMenus(entries)
        #expect(delegate.exportSubmenu.items.count == 2)
        #expect(delegate.exportSubmenu.items[1].title == "RST")
    }

    // MARK: - Second call replaces, not appends

    @Test func secondPopulateReplacesItems() {
        let delegate = makeDelegate()
        let first = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markupeditor-markdown.js")]
        let second = [AppConfig.PluginConfigEntry(name: "RST", filename: "markup-editor-rst.js")]
        delegate.populatePluginMenus(first)
        delegate.populatePluginMenus(second)
        #expect(delegate.exportSubmenu.items.count == 1)
        #expect(delegate.exportSubmenu.items[0].title == "RST")
    }

    // MARK: - Empty manifest clears exportSubmenu

    @Test func populateWithEmptyManifestClearsExportSubmenu() {
        let delegate = makeDelegate()
        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markupeditor-markdown.js")]
        delegate.populatePluginMenus(entries)
        #expect(delegate.exportSubmenu.items.count == 1)
        delegate.populatePluginMenus([])
        #expect(delegate.exportSubmenu.items.isEmpty)
    }

    // MARK: - Menu item wiring
    //
    // These tests verify the action selector and target are wired correctly without
    // invoking the action. Invoking would post to NotificationCenter.default, which
    // the live MarkupDocumentView also observes — causing NSSavePanel to appear
    // during the test run. Functional end-to-end verification is in bead o5g.

    @Test func exportMenuItemIsWiredToDelegate() {
        let delegate = makeDelegate()
        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markupeditor-markdown.js")]
        delegate.populatePluginMenus(entries)

        let item = delegate.exportSubmenu.items[0]
        #expect(item.action != nil)
        #expect(item.target === delegate)
        #expect(NSStringFromSelector(item.action!) == "exportPluginAction:")
    }

    // MARK: - Plugin action userInfo content
    //
    // The action method is @objc private. Triggering it via performClick posts to
    // NotificationCenter.default, which the live MarkupDocumentView also observes.
    // Instead, we verify that populatePluginMenus stores the full entry
    // (including fileExtension) as representedObject on each menu item.

    @Test func exportMenuItemRepresentedObjectCarriesFileExtension() {
        let delegate = makeDelegate()
        let entry = AppConfig.PluginConfigEntry(name: "Markdown", filename: "markupeditor-markdown.js", fileExtension: "md")
        delegate.populatePluginMenus([entry])
        let stored = delegate.exportSubmenu.items[0].representedObject as? AppConfig.PluginConfigEntry
        #expect(stored?.fileExtension == "md")
    }
}
