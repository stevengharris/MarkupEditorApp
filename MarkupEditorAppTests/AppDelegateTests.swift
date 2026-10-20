//
//  AppDelegateTests.swift
//  MarkupEditorAppTests

import Testing
import AppKit
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

    @Test(arguments: ["SUStatus", "plugin-gallery", "com_apple_SwiftUI_Settings_window", "welcome", "upgrade", ""])
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

    @Test(arguments: ["plugin-gallery", "welcome", "upgrade", "com_apple_SwiftUI_Settings_window", ""])
    func testClosingAnotherWindowJustCloses(identifier: String) {
        #expect(AppDelegate.closeAction(forWindowIdentifier: identifier, skipTerminateCheck: false) == .closeNow)
    }

    @Test func testClosingAWindowWithoutAnIdentifierJustCloses() {
        #expect(AppDelegate.closeAction(forWindowIdentifier: nil, skipTerminateCheck: false) == .closeNow)
    }
}
