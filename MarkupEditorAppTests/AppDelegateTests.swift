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
        #expect(MarkupDocumentView.dismissesSettings(whenClosingWindow: "main"))
    }

    @Test(arguments: ["SUStatus", "plugin-gallery", "com_apple_SwiftUI_Settings_window", "welcome", "upgrade", ""])
    func testClosingAnotherWindowLeavesSettingsOpen(identifier: String) {
        #expect(!MarkupDocumentView.dismissesSettings(whenClosingWindow: identifier))
    }

    @Test func testClosingAWindowWithoutAnIdentifierLeavesSettingsOpen() {
        #expect(!MarkupDocumentView.dismissesSettings(whenClosingWindow: nil))
    }
}

@MainActor struct WindowCloseGuardTests {

    private final class RecordingDelegate: NSObject, NSWindowDelegate {
        var resizes = 0
        var closeQueries = 0
        func windowDidResize(_ notification: Notification) { resizes += 1 }
        func windowShouldClose(_ sender: NSWindow) -> Bool { closeQueries += 1; return true }
    }

    @Test func testWindowShouldCloseUsesTheGuardClosure() {
        let window = NSWindow()
        let wrapped = RecordingDelegate()
        var asked: NSWindow?
        let closeGuard = WindowCloseGuard(wrapping: wrapped) { asked = $0; return false }
        #expect(closeGuard.windowShouldClose(window) == false)
        #expect(asked === window)
        #expect(wrapped.closeQueries == 0)
    }

    @Test func testOtherDelegateMessagesReachTheWrappedDelegate() {
        let wrapped = RecordingDelegate()
        let closeGuard = WindowCloseGuard(wrapping: wrapped) { _ in true }
        #expect(closeGuard.responds(to: #selector(NSWindowDelegate.windowDidResize(_:))))
        _ = closeGuard.perform(#selector(NSWindowDelegate.windowDidResize(_:)), with: Notification(name: NSWindow.didResizeNotification))
        #expect(wrapped.resizes == 1)
    }

    @Test func testAWindowNotifiesTheWrappedDelegateThroughTheGuard() {
        let window = NSWindow()
        let wrapped = RecordingDelegate()
        let closeGuard = WindowCloseGuard(wrapping: wrapped) { _ in true }
        window.delegate = closeGuard
        NotificationCenter.default.post(name: NSWindow.didResizeNotification, object: window)
        #expect(wrapped.resizes == 1)
    }
}
