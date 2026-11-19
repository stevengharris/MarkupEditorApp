//
//  ShortcutURLRoutingTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
import MarkupEditorAppLib
@testable import MarkupEditorApp

// A Shortcut callback must never reach the document-opening path, whatever the window is doing.
@MainActor @Suite(.serialized) struct ShortcutURLRoutingTests {

    private final class Opened: @unchecked Sendable {
        var urls: [URL] = []
    }

    private func runs() -> ShortcutRunStore {
        ShortcutRunStore(timeout: .seconds(120), sleeper: { _ in try await Task.sleep(for: .seconds(3600)) })
    }

    @Test func testShortcutURLsRouteToTheRunStoreAndEverythingElseToTheDocument() {
        #expect(OpenURLRoute.route(for: URL(string: "markupeditor-action://success?run=x")!) == .shortcutCallback)
        #expect(OpenURLRoute.route(for: URL(string: "MARKUPEDITOR-ACTION://cancel")!) == .shortcutCallback)
        #expect(OpenURLRoute.route(for: URL(fileURLWithPath: "/tmp/a.md")) == .document)
        #expect(OpenURLRoute.route(for: URL(string: "https://example.com")!) == .document)
    }

    @Test func testAnShortcutURLCompletesTheRunAndNeverOpensADocument() async throws {
        AppDelegate.pendingFinderURL = nil
        defer { AppDelegate.pendingFinderURL = nil }
        let store = runs()
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        let opened = Opened()
        OpenURLRoute.dispatch(ShortcutCallbackURL.urls(for: ticket.id).cancel, runs: store) { opened.urls.append($0) }
        try #require(!store.isRunning("Publish"), "the callback did not reach the run store")
        #expect(await ticket.result() == .cancelled)
        #expect(opened.urls.isEmpty)
        #expect(AppDelegate.pendingFinderURL == nil)
    }

    @Test func testAnUnknownShortcutURLIsDroppedAndNeverOpensADocument() {
        AppDelegate.pendingFinderURL = nil
        defer { AppDelegate.pendingFinderURL = nil }
        let opened = Opened()
        OpenURLRoute.dispatch(ShortcutCallbackURL.urls(for: UUID()).success, runs: runs()) { opened.urls.append($0) }
        #expect(opened.urls.isEmpty)
        #expect(AppDelegate.pendingFinderURL == nil)
    }

    @Test func testAnotherURLTakesTheDocumentPathAndLeavesTheRunStoreAlone() throws {
        let store = runs()
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        let opened = Opened()
        let file = URL(fileURLWithPath: "/tmp/post.md")
        OpenURLRoute.dispatch(file, runs: store) { opened.urls.append($0) }
        #expect(opened.urls == [file])
        #expect(store.isRunning("Publish"))
        _ = ticket
    }

    @Test func testTheAppRegistersTheShortcutScheme() throws {
        let types = try #require(Bundle(for: AppDelegate.self).object(forInfoDictionaryKey: "CFBundleURLTypes") as? [[String: Any]])
        let schemes = types.flatMap { $0["CFBundleURLSchemes"] as? [String] ?? [] }
        #expect(schemes.contains(ShortcutCallbackURL.scheme))
    }
}
