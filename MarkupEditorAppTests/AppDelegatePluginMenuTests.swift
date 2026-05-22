//
//  AppDelegatePluginMenuTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
import AppKit
@testable import MarkupEditorApp

// Tests for AppDelegate plugin menu construction.
//
// AppDelegate.buildMenu() creates Export and Import submenus under File.
// AppDelegate.populatePluginMenus(_:) fills those submenus from a manifest.
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

    private func exportSubmenu(from delegate: AppDelegate) -> NSMenu? {
        delegate.exportSubmenu
    }

    private func importSubmenu(from delegate: AppDelegate) -> NSMenu? {
        delegate.importSubmenu
    }

    // MARK: - buildMenu creates Export and Import submenus

    @Test func buildMenuCreatesExportItemInFileMenu() {
        let delegate = makeDelegate()
        let fileMenu = fileMenu(from: NSApp.mainMenu!)
        let exportItem = fileMenu?.items.first(where: { $0.title == "Export" })
        #expect(exportItem != nil)
        #expect(exportItem?.submenu != nil)
        #expect(exportItem?.submenu?.items.isEmpty == true)
    }

    @Test func buildMenuCreatesImportItemInFileMenu() {
        let delegate = makeDelegate()
        let fileMenu = fileMenu(from: NSApp.mainMenu!)
        let importItem = fileMenu?.items.first(where: { $0.title == "Import" })
        #expect(importItem != nil)
        #expect(importItem?.submenu != nil)
        #expect(importItem?.submenu?.items.isEmpty == true)
        _ = delegate  // suppress unused warning
    }

    @Test func exportSubmenuIsStoredAsProperty() {
        let delegate = makeDelegate()
        #expect(delegate.exportSubmenu.items.isEmpty)
    }

    @Test func importSubmenuIsStoredAsProperty() {
        let delegate = makeDelegate()
        #expect(delegate.importSubmenu.items.isEmpty)
    }

    // MARK: - populatePluginMenus fills both submenus

    @Test func populatePluginMenusAddsOneItemPerSubmenus() {
        let delegate = makeDelegate()
        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js")]
        delegate.populatePluginMenus(entries)
        #expect(delegate.exportSubmenu.items.count == 1)
        #expect(delegate.exportSubmenu.items[0].title == "Markdown")
        #expect(delegate.importSubmenu.items.count == 1)
        #expect(delegate.importSubmenu.items[0].title == "Markdown")
    }

    @Test func populatePluginMenusAddsMultipleItems() {
        let delegate = makeDelegate()
        let entries = [
            AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js"),
            AppConfig.PluginConfigEntry(name: "RST", filename: "markup-editor-rst.js")
        ]
        delegate.populatePluginMenus(entries)
        #expect(delegate.exportSubmenu.items.count == 2)
        #expect(delegate.importSubmenu.items.count == 2)
        #expect(delegate.exportSubmenu.items[1].title == "RST")
        #expect(delegate.importSubmenu.items[1].title == "RST")
    }

    // MARK: - Second call replaces, not appends

    @Test func secondPopulateReplacesItems() {
        let delegate = makeDelegate()
        let first = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js")]
        let second = [AppConfig.PluginConfigEntry(name: "RST", filename: "markup-editor-rst.js")]
        delegate.populatePluginMenus(first)
        delegate.populatePluginMenus(second)
        #expect(delegate.exportSubmenu.items.count == 1)
        #expect(delegate.exportSubmenu.items[0].title == "RST")
        #expect(delegate.importSubmenu.items.count == 1)
        #expect(delegate.importSubmenu.items[0].title == "RST")
    }

    // MARK: - Empty manifest clears both submenus

    @Test func populateWithEmptyManifestClearsSubmenus() {
        let delegate = makeDelegate()
        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js")]
        delegate.populatePluginMenus(entries)
        #expect(delegate.exportSubmenu.items.count == 1)
        delegate.populatePluginMenus([])
        #expect(delegate.exportSubmenu.items.isEmpty)
        #expect(delegate.importSubmenu.items.isEmpty)
    }

    // MARK: - Notifications

    @Test func exportMenuItemPostsNotification() async {
        let delegate = makeDelegate()
        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js")]
        delegate.populatePluginMenus(entries)

        var received: Notification?
        let token = NotificationCenter.default.addObserver(
            forName: .menuExportPlugin,
            object: nil,
            queue: .main
        ) { notification in
            received = notification
        }
        defer { NotificationCenter.default.removeObserver(token) }

        // Simulate menu item click by sending action
        let item = delegate.exportSubmenu.items[0]
        NSApp.sendAction(item.action!, to: item.target, from: item)

        // Give the run loop one tick
        await Task.yield()

        #expect(received != nil)
        let userInfo = received?.userInfo
        #expect(userInfo?["name"] as? String == "Markdown")
        #expect(userInfo?["filename"] as? String == "markup-editor-markdown.js")
    }

    @Test func importMenuItemPostsNotification() async {
        let delegate = makeDelegate()
        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: "markup-editor-markdown.js")]
        delegate.populatePluginMenus(entries)

        var received: Notification?
        let token = NotificationCenter.default.addObserver(
            forName: .menuImportPlugin,
            object: nil,
            queue: .main
        ) { notification in
            received = notification
        }
        defer { NotificationCenter.default.removeObserver(token) }

        let item = delegate.importSubmenu.items[0]
        NSApp.sendAction(item.action!, to: item.target, from: item)

        await Task.yield()

        #expect(received != nil)
        let userInfo = received?.userInfo
        #expect(userInfo?["name"] as? String == "Markdown")
        #expect(userInfo?["filename"] as? String == "markup-editor-markdown.js")
    }
}
