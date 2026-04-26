//
//  AppDelegateTests.swift
//  MarkupEditorAppTests

import Testing
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
        let url = URL(fileURLWithPath: NSTemporaryDirectory() + UUID().uuidString + ".htmd")
        AppDelegate.pendingFinderURL = url
        defer { AppDelegate.pendingFinderURL = nil }
        #expect(AppDelegate.consumePendingURL() == url)
        #expect(AppDelegate.pendingFinderURL == nil)
    }

    @Test func testConsumeIsIdempotent() {
        let url = URL(fileURLWithPath: NSTemporaryDirectory() + UUID().uuidString + ".htmd")
        AppDelegate.pendingFinderURL = url
        defer { AppDelegate.pendingFinderURL = nil }
        #expect(AppDelegate.consumePendingURL() == url)
        #expect(AppDelegate.consumePendingURL() == nil)
    }
}
