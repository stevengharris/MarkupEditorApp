//
//  AppDelegateTests.swift
//  MarkupEditorAppTests

import Testing
import AppKit
import MarkupEditor
import Foundation
@testable import MarkupEditorApp

// .serialized prevents races on the shared static AppDelegate.pendingFinderURL
@MainActor @Suite(.serialized) struct AppDelegateConsumePendingURLTests {

    @Test func testConsumePendingURLReturnsNilWhenEmpty() {
        AppDelegate.pendingFinderURL = nil
        defer { AppDelegate.pendingFinderURL = nil }
        #expect(AppDelegate.consumePendingURL() == nil)
    }

    @Test func testConsumePendingURLReturnsURLAndClears() {
        let url = URL(fileURLWithPath: NSTemporaryDirectory() + UUID().uuidString + ".md")
        AppDelegate.pendingFinderURL = url
        defer { AppDelegate.pendingFinderURL = nil }
        #expect(AppDelegate.consumePendingURL() == url)
        #expect(AppDelegate.pendingFinderURL == nil)
    }

    @Test func testConsumeIsIdempotent() {
        let url = URL(fileURLWithPath: NSTemporaryDirectory() + UUID().uuidString + ".md")
        AppDelegate.pendingFinderURL = url
        defer { AppDelegate.pendingFinderURL = nil }
        #expect(AppDelegate.consumePendingURL() == url)
        #expect(AppDelegate.consumePendingURL() == nil)
    }
}

// .serialized prevents races on the shared static AppDelegate.pendingWelcomeDocument
@MainActor @Suite(.serialized) struct AppDelegateConsumePendingWelcomeDocumentTests {

    @Test func testConsumeReturnsFalseWhenNotPending() {
        AppDelegate.pendingWelcomeDocument = false
        #expect(!AppDelegate.consumePendingWelcomeDocument())
    }

    @Test func testConsumeReturnsTrueOnceThenClears() {
        AppDelegate.pendingWelcomeDocument = true
        defer { AppDelegate.pendingWelcomeDocument = false }
        #expect(AppDelegate.consumePendingWelcomeDocument())
        #expect(!AppDelegate.pendingWelcomeDocument)
        #expect(!AppDelegate.consumePendingWelcomeDocument())
    }
}

// .serialized prevents races on the shared static AppDelegate.upgradeOnly
@MainActor @Suite(.serialized) struct AppDelegateReopenTests {

    @Test func testReopenIsHandledByDefault() {
        AppDelegate.upgradeOnly = false
        #expect(AppDelegate().applicationShouldHandleReopen(NSApplication.shared, hasVisibleWindows: false))
    }

    @Test func testReopenIsSuppressedWhenUpgradeOnly() {
        AppDelegate.upgradeOnly = true
        defer { AppDelegate.upgradeOnly = false }
        #expect(!AppDelegate().applicationShouldHandleReopen(NSApplication.shared, hasVisibleWindows: false))
    }
}

@MainActor struct SettingsDismissalTests {

    @Test func testClosingTheDocumentWindowDismissesSettings() {
        #expect(MarkupDocumentView.dismissesSettings(whenClosingWindow: MarkupEditorApp.mainWindowID))
    }

    @Test(arguments: ["SUStatus", "com_apple_SwiftUI_Settings_window", "welcome", "upgrade", ""])
    func testClosingAnotherWindowLeavesSettingsOpen(identifier: String) {
        #expect(!MarkupDocumentView.dismissesSettings(whenClosingWindow: identifier))
    }

    @Test func testClosingAWindowWithoutAnIdentifierLeavesSettingsOpen() {
        #expect(!MarkupDocumentView.dismissesSettings(whenClosingWindow: nil))
    }
}

@MainActor struct WindowCloseActionTests {

    @Test func testClosingTheDocumentWindowChecksForUnsavedChangesFirst() {
        let action = AppDelegate.closeAction(forWindowIdentifier: MarkupEditorApp.mainWindowID, skipTerminateCheck: false)
        #expect(action == .quitAfterSaveCheck)
    }

    @Test func testClosingTheDocumentWindowDuringQuitJustCloses() {
        let action = AppDelegate.closeAction(forWindowIdentifier: MarkupEditorApp.mainWindowID, skipTerminateCheck: true)
        #expect(action == .closeNow)
    }

    @Test(arguments: ["welcome", "upgrade", "com_apple_SwiftUI_Settings_window", ""])
    func testClosingAnotherWindowJustCloses(identifier: String) {
        #expect(AppDelegate.closeAction(forWindowIdentifier: identifier, skipTerminateCheck: false) == .closeNow)
    }

    @Test func testClosingAWindowWithoutAnIdentifierJustCloses() {
        #expect(AppDelegate.closeAction(forWindowIdentifier: nil, skipTerminateCheck: false) == .closeNow)
    }
}

// The Edit > Suggestions submenu (P4.1). The four JS strings are the names the web side
// exports on MU; the JS tests pin the same names, so a rename breaks one of the two.
@MainActor struct SuggestionsMenuTests {

    private static let expectedJS = [
        "Next Suggestion": "MU.nextSuggestion()",
        "Previous Suggestion": "MU.previousSuggestion()",
        "Accept All Suggestions": "MU.acceptAllSuggestions()",
        "Reject All Suggestions": "MU.rejectAllSuggestions()",
    ]

    private func suggestionsSubmenu(of delegate: AppDelegate) -> NSMenu? {
        let editMenu = delegate.buildMenu().items.compactMap(\.submenu).first { $0.title == "Edit" }
        return editMenu?.items.first { $0.title == "Suggestions" }?.submenu
    }

    @Test func testEditMenuHoldsASuggestionsSubmenuAfterFind() {
        let delegate = AppDelegate()
        let editMenu = delegate.buildMenu().items.compactMap(\.submenu).first { $0.title == "Edit" }
        let titles = editMenu?.items.map(\.title) ?? []
        let find = titles.firstIndex(of: "Find")
        let suggestions = titles.firstIndex(of: "Suggestions")
        #expect(find != nil && suggestions != nil, "Edit items: \(titles)")
        if let find, let suggestions { #expect(suggestions > find) }
    }

    @Test func testSuggestionsSubmenuHasTheFourCommandsWithTheirJSAndATarget() throws {
        let delegate = AppDelegate()
        let submenu = try #require(suggestionsSubmenu(of: delegate))
        #expect(submenu.items.filter { !$0.isSeparatorItem }.map(\.title)
                == ["Next Suggestion", "Previous Suggestion", "Accept All Suggestions", "Reject All Suggestions"])
        try #require(submenu.items.count > 2, "Suggestions items: \(submenu.items.map(\.title))")
        #expect(submenu.items[2].isSeparatorItem, "a separator sets the all-at-once commands apart")
        for item in submenu.items where !item.isSeparatorItem {
            #expect(item.representedObject as? String == Self.expectedJS[item.title], "\(item.title): \(String(describing: item.representedObject))")
            #expect(item.target === delegate, "\(item.title) target")
            #expect(item.action != nil, "\(item.title) action")
        }
    }

    @Test func testAcceptAndRejectAllCarryNoKeyEquivalent() throws {
        let delegate = AppDelegate()
        let submenu = try #require(suggestionsSubmenu(of: delegate))
        for title in ["Accept All Suggestions", "Reject All Suggestions"] {
            let item = try #require(submenu.items.first { $0.title == title })
            #expect(item.keyEquivalent.isEmpty, "\(title) changes text; no shortcut")
        }
    }

    @Test func testNoKeyEquivalentCollidesAcrossTheWholeMenuWithOrWithoutTheKeymap() {
        for withKeymap in [false, true] {
            let delegate = AppDelegate()
            if withKeymap { delegate.keymap = KeymapConfig() }
            var seen: [String: String] = [:]   // chord -> title
            var counted = 0
            func walk(_ menu: NSMenu) {
                for item in menu.items {
                    if !item.keyEquivalent.isEmpty {
                        let mods = item.keyEquivalentModifierMask.intersection(.deviceIndependentFlagsMask).rawValue
                        let chord = "\(item.keyEquivalent)|\(mods)"
                        counted += 1
                        #expect(seen[chord] == nil, "'\(item.title)' collides with '\(seen[chord] ?? "")' on \(chord) (keymap: \(withKeymap))")
                        seen[chord] = item.title
                    }
                    if let sub = item.submenu { walk(sub) }
                }
            }
            walk(delegate.buildMenu())
            #expect(counted >= 10, "only \(counted) key equivalents seen (keymap: \(withKeymap)); the check would be vacuous")
            if withKeymap {
                // the Format menu's keymap-driven chords are in play: more than the keymap-free build
                #expect(counted >= 20, "keymap-driven chords missing: \(counted)")
            }
        }
    }
}
