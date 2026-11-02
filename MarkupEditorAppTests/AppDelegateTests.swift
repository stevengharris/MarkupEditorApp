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

// The Edit > Suggestions submenu (P4.1). The JS strings are the names the web side
// exports on MU; the JS tests pin the same names, so a rename breaks one of the two.
@MainActor struct SuggestionsMenuTests {

    private static let expectedJS = [
        "Next Suggestion": "MU.nextSuggestion()",
        "Previous Suggestion": "MU.previousSuggestion()",
        "Accept+Next": "MU.acceptAndNextSuggestion()",
        "Accept+Previous": "MU.acceptAndPreviousSuggestion()",
        "Reject+Next": "MU.rejectAndNextSuggestion()",
        "Reject+Previous": "MU.rejectAndPreviousSuggestion()",
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

    @Test func testSuggestionsSubmenuHasItsEightCommandsWithTheirJSAndATarget() throws {
        let delegate = AppDelegate()
        let submenu = try #require(suggestionsSubmenu(of: delegate))
        #expect(submenu.items.filter { !$0.isSeparatorItem }.map(\.title)
                == ["Next Suggestion", "Previous Suggestion", "Accept+Next", "Accept+Previous", "Reject+Next", "Reject+Previous",
                    "Accept All Suggestions", "Reject All Suggestions"])
        try #require(submenu.items.count == 10, "Suggestions items: \(submenu.items.map(\.title))")
        #expect(submenu.items[2].isSeparatorItem && submenu.items[7].isSeparatorItem, "separators set off the selected-suggestion and all-at-once commands")
        for item in submenu.items where !item.isSeparatorItem {
            #expect(item.representedObject as? String == Self.expectedJS[item.title], "\(item.title): \(String(describing: item.representedObject))")
            #expect(item.target === delegate, "\(item.title) target")
            #expect(item.action != nil, "\(item.title) action")
        }
    }

    /// The chord each command shows: the key moves, Shift reverses, Option accepts, Control rejects. Shift is not in the
    /// mask because the shifted character `"` stands for it.
    private static let chords: [String: (key: String, mask: NSEvent.ModifierFlags)] = [
        "Next Suggestion": ("'", .command),
        "Previous Suggestion": ("\"", .command),
        "Accept+Next": ("'", [.command, .option]),
        "Accept+Previous": ("\"", [.command, .option]),
        "Reject+Next": ("'", [.command, .control]),
        "Reject+Previous": ("\"", [.command, .control]),
    ]

    @Test func testEachMovingCommandHasItsChordAndAllAtOnceCommandsHaveNone() throws {
        let delegate = AppDelegate()
        let submenu = try #require(suggestionsSubmenu(of: delegate))
        for (title, chord) in Self.chords {
            let item = try #require(submenu.items.first { $0.title == title })
            #expect(item.keyEquivalent == chord.key, "\(title) key")
            #expect(item.keyEquivalentModifierMask == chord.mask, "\(title) modifiers")
        }
        for title in ["Accept All Suggestions", "Reject All Suggestions"] {
            let item = try #require(submenu.items.first { $0.title == title })
            #expect(item.keyEquivalent.isEmpty, "\(title) changes text throughout; no shortcut")
        }
    }

    /// A key event as the keyboard delivers it: `typed` is the character without modifiers but with Shift, and Option changes
    /// what `characters` holds.
    private func chordEvent(shift: Bool, modifiers: NSEvent.ModifierFlags) throws -> NSEvent {
        let typed = shift ? "\"" : "'"
        let characters = modifiers.contains(.option) ? (shift ? "Æ" : "æ") : typed
        let flags = shift ? modifiers.union(.shift) : modifiers
        return try #require(NSEvent.keyEvent(
            with: .keyDown, location: .zero, modifierFlags: flags, timestamp: 0, windowNumber: 0, context: nil,
            characters: characters, charactersIgnoringModifiers: typed, isARepeat: false, keyCode: 39))
    }

    @Test func testEveryChordIsDeliveredToItsItemThroughTheMenu() throws {
        let delegate = AppDelegate()
        delegate.suggestionsState = { (enabled: true, sourceShowing: false, pending: 2, selected: true) }
        let menu = delegate.buildMenu()
        let submenu = try #require(menu.items.compactMap(\.submenu).first { $0.title == "Edit" }?.items.first { $0.title == "Suggestions" }?.submenu)
        submenu.update()
        for (title, chord) in Self.chords {
            let shift = chord.key == "\""
            let event = try chordEvent(shift: shift, modifiers: chord.mask)
            #expect(menu.performKeyEquivalent(with: event), "\(title) was not delivered to a menu item")
        }
    }

    @Test func testTheMenuTakesItsChordsFromTheKeymap() throws {
        var keymap = KeymapConfig()
        keymap.bindings["suggestionNext"] = [KeyBinding.from(spec: "Mod-Alt-n")]
        keymap.bindings["suggestionPrevious"] = [KeyBinding.from(spec: "")]
        let delegate = AppDelegate()
        delegate.keymap = keymap
        let submenu = try #require(suggestionsSubmenu(of: delegate))
        let next = try #require(submenu.items.first { $0.title == "Next Suggestion" })
        let previous = try #require(submenu.items.first { $0.title == "Previous Suggestion" })
        #expect(next.keyEquivalent == "n" && next.keyEquivalentModifierMask == [.command, .option])
        #expect(previous.keyEquivalent.isEmpty, "a cleared binding leaves the item without a shortcut")
        let acceptNext = try #require(submenu.items.first { $0.title == "Accept+Next" })
        #expect(acceptNext.keyEquivalent == "'", "an action the keymap leaves alone keeps its default")
    }

    private func item(titled title: String, in menu: NSMenu) -> NSMenuItem? {
        for item in menu.items {
            if item.title == title { return item }
            if let submenu = item.submenu, let found = self.item(titled: title, in: submenu) { return found }
        }
        return nil
    }

    @Test func testChangingTheKeymapUpdatesTheBuiltMenuInPlace() throws {
        let delegate = AppDelegate()
        let menu = delegate.buildMenu()
        var changed = KeymapConfig()
        changed.bindings["suggestionAcceptPrevious"] = [KeyBinding.from(spec: "Mod-Alt-[")]
        changed.bindings["suggestionNext"] = [KeyBinding.from(spec: "")]
        changed.bindings["bold"] = [KeyBinding.from(spec: "Mod-Shift-y")]
        delegate.applyKeymap(changed, to: menu)

        let acceptPrevious = try #require(item(titled: "Accept+Previous", in: menu))
        #expect(acceptPrevious.keyEquivalent == "[" && acceptPrevious.keyEquivalentModifierMask == [.command, .option])
        let next = try #require(item(titled: "Next Suggestion", in: menu))
        #expect(next.keyEquivalent.isEmpty, "a cleared binding removes the shortcut")
        let bold = try #require(item(titled: "Bold", in: menu), "the Format menu has Bold")
        #expect(bold.keyEquivalent == "y" && bold.keyEquivalentModifierMask == [.command, .shift], "Format items follow the keymap too")
        let find = try #require(item(titled: "Find", in: menu))
        #expect(find.keyEquivalent == "f", "an item the keymap does not drive is left alone")
        let unchanged = try #require(item(titled: "Reject+Next", in: menu))
        #expect(unchanged.keyEquivalent == "'" && unchanged.keyEquivalentModifierMask == [.command, .control])
    }

    @Test func testAMenuBuiltAfterTheChangeUsesTheNewKeymap() throws {
        var changed = KeymapConfig()
        changed.bindings["suggestionAcceptPrevious"] = [KeyBinding.from(spec: "Mod-Alt-[")]
        let delegate = AppDelegate()
        delegate.keymap = changed
        let menu = delegate.buildMenu()
        let acceptPrevious = try #require(item(titled: "Accept+Previous", in: menu))
        #expect(acceptPrevious.keyEquivalent == "[" && acceptPrevious.keyEquivalentModifierMask == [.command, .option])
    }

    @Test func testSavingTheKeymapReachesTheRunningMenu() async throws {
        let key = AppConfig.ConfigKey.keymap
        let before = UserDefaults.standard.string(forKey: key)
        defer {
            if let before { UserDefaults.standard.set(before, forKey: key) } else { UserDefaults.standard.removeObject(forKey: key) }
            NotificationCenter.default.post(name: .keymapDidChange, object: nil)
        }
        // The delegate that launched the test host holds the running menu, so the whole path runs: the saved JSON, the
        // notification the Settings view posts, the delegate's observer, and the menu items.
        // A binding nobody has saved: the test host shares the app's preferences, so a real saved value could already be showing.
        UserDefaults.standard.set(#"{"suggestionAcceptPrevious":"Mod-Ctrl-;"}"#, forKey: key)
        NotificationCenter.default.post(name: .keymapDidChange, object: nil)
        var found: NSMenuItem?
        for _ in 0..<40 {
            if let menu = NSApplication.shared.mainMenu, let item = item(titled: "Accept+Previous", in: menu), item.keyEquivalent == ";" {
                found = item
                break
            }
            try await Task.sleep(for: .milliseconds(50))
        }
        let item = try #require(found, "the running menu did not pick up the saved binding")
        #expect(item.keyEquivalentModifierMask == [.command, .control])
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

    private func editMenu(of delegate: AppDelegate) throws -> NSMenu {
        try #require(delegate.buildMenu().items.compactMap(\.submenu).first { $0.title == "Edit" })
    }

    @Test func testTheSuggestionsItemIsHiddenUnlessAssistantsAreEnabled() throws {
        let delegate = AppDelegate()
        let edit = try editMenu(of: delegate)
        let item = try #require(edit.items.first { $0.title == "Suggestions" })
        delegate.suggestionsState = { (enabled: false, sourceShowing: false, pending: 3, selected: false) }
        delegate.menuNeedsUpdate(edit)
        #expect(item.isHidden, "assistants off: nothing can propose, so the item is not offered")
        delegate.suggestionsState = { (enabled: true, sourceShowing: false, pending: 0, selected: false) }
        delegate.menuNeedsUpdate(edit)
        #expect(!item.isHidden)
    }

    @Test func testTheSuggestionCommandsAreEnabledOnlyWhileSomethingIsPending() throws {
        let delegate = AppDelegate()
        let submenu = try #require(suggestionsSubmenu(of: delegate))
        let commands = submenu.items.filter { !$0.isSeparatorItem }
        try #require(commands.count == 8)
        delegate.suggestionsState = { (enabled: true, sourceShowing: false, pending: 0, selected: false) }
        for item in commands { #expect(!delegate.validateMenuItem(item), "\(item.title) with none pending") }
        delegate.suggestionsState = { (enabled: true, sourceShowing: false, pending: 2, selected: true) }
        for item in commands { #expect(delegate.validateMenuItem(item), "\(item.title) with two pending and one selected") }
        delegate.suggestionsState = { (enabled: false, sourceShowing: false, pending: 2, selected: true) }
        for item in commands { #expect(!delegate.validateMenuItem(item), "\(item.title) with assistants off") }
        delegate.suggestionsState = { (enabled: true, sourceShowing: true, pending: 2, selected: true) }
        for item in commands { #expect(!delegate.validateMenuItem(item), "\(item.title) while the source view is showing") }
    }

    @Test func testTheAcceptAndRejectCommandsNeedTheSelectionToBeOnASuggestion() throws {
        let delegate = AppDelegate()
        let submenu = try #require(suggestionsSubmenu(of: delegate))
        let needSelection: Set = ["Accept+Next", "Accept+Previous", "Reject+Next", "Reject+Previous"]
        delegate.suggestionsState = { (enabled: true, sourceShowing: false, pending: 2, selected: false) }
        for item in submenu.items where !item.isSeparatorItem {
            #expect(delegate.validateMenuItem(item) == !needSelection.contains(item.title), "\(item.title) with two pending, none selected")
        }
        delegate.suggestionsState = { (enabled: true, sourceShowing: false, pending: 2, selected: true) }
        for item in submenu.items where !item.isSeparatorItem {
            #expect(delegate.validateMenuItem(item), "\(item.title) with one selected")
        }
    }

    @Test func testOtherEditorCommandsAreNotAffectedByTheSuggestionState() throws {
        let delegate = AppDelegate()
        let edit = try editMenu(of: delegate)
        let find = try #require(edit.items.first { $0.title == "Find" })
        delegate.suggestionsState = { (enabled: false, sourceShowing: false, pending: 0, selected: false) }
        #expect(delegate.validateMenuItem(find))
    }
}
