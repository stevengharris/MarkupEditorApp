//
//  InfoTypeTests.swift
//  MarkupEditorAppTests

import Testing
import SwiftUI
import Foundation
@testable import MarkupEditorApp

@MainActor struct InfoTypeTests {

    private func defaults() -> (UserDefaults, () -> Void) {
        let name = "InfoTypeTests-\(UUID().uuidString)"
        let suite = UserDefaults(suiteName: name)!
        return (suite, { suite.removePersistentDomain(forName: name) })
    }

    @Test func testThePickerShowsLogPluginsAndTools() {
        #expect(InfoType.allCases.map(\.rawValue) == ["Log", "Plugins", "Tools"])
    }

    @Test func testTheOldTemplatesValueNoLongerDecodes() {
        #expect(InfoType(rawValue: "Templates") == nil)
        #expect(InfoType(rawValue: "Tools") == .tools)
    }

    @Test func testAStoredTemplatesTabOpensThePluginsTab() {
        let (suite, cleanup) = defaults()
        defer { cleanup() }
        suite.set("Templates", forKey: InfoType.storageKey)
        let storage = AppStorage(wrappedValue: InfoType.plugins, InfoType.storageKey, store: suite)
        #expect(storage.wrappedValue == .plugins)
    }

    @Test func testAStoredToolsTabIsKept() {
        let (suite, cleanup) = defaults()
        defer { cleanup() }
        suite.set("Tools", forKey: InfoType.storageKey)
        let storage = AppStorage(wrappedValue: InfoType.plugins, InfoType.storageKey, store: suite)
        #expect(storage.wrappedValue == .tools)
    }
}
