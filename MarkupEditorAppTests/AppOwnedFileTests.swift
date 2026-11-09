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

    @Test func aFileInApplicationSupportIsAppOwned() {
        #expect(MarkupDocument.isAppOwned(support.appendingPathComponent("templates/a/a.md")))
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
