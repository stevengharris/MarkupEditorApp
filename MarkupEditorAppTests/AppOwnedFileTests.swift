//
//  AppOwnedFileTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor
struct AppOwnedFileTests {

    private var support: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    }

    @Test func aFileInTheTemplatesFolderIsAppOwned() {
        #expect(MarkupDocument.isAppOwned(support.appendingPathComponent("templates/a/a.md")))
    }

    @Test func otherFilesInApplicationSupportAreNot() {
        #expect(!MarkupDocument.isAppOwned(support.appendingPathComponent("exporters/exporter-docx.js")))
        #expect(!MarkupDocument.isAppOwned(support.appendingPathComponent("templates-other/a.md")))
        #expect(!MarkupDocument.isAppOwned(support.appendingPathComponent("templates")))
    }

    @Test func otherFilesAndALookalikeFolderAreNot() {
        #expect(!MarkupDocument.isAppOwned(URL(fileURLWithPath: "/Users/someone/Documents/a.md")))
        #expect(!MarkupDocument.isAppOwned(URL(fileURLWithPath: support.path + "-other/a.md")))
    }

    @Test func anAppOwnedFileNeedsNoStoredBookmark() {
        let url = support.appendingPathComponent("templates/a/a.md")
        #expect(MarkupDocument().resolveParentDirBookmark(for: url) == url.deletingLastPathComponent())
    }
}
