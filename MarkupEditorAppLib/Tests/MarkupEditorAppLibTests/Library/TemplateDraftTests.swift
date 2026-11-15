//
//  TemplateDraftTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct TemplateDraftTests {

    @Test func aMarkdownDocumentBecomesADraftNamedAfterItsFile() throws {
        let draft = try UserLibrary.draft(
            isHTML: false, markdown: "# Title", assets: ["img/a.png"], documentURL: URL(fileURLWithPath: "/tmp/My Notes.md"))
        #expect(draft == TemplateDraft(markdown: "# Title", assets: ["img/a.png"], name: "My Notes"))
    }

    @Test func anUnsavedDocumentGetsAnEmptyName() throws {
        let draft = try UserLibrary.draft(isHTML: false, markdown: "text", assets: [], documentURL: nil)
        #expect(draft.name == "")
    }

    @Test func anHTMLDocumentIsRefused() {
        #expect(throws: TemplateDraftError.notMarkdown) {
            try UserLibrary.draft(isHTML: true, markdown: "<p>x</p>", assets: [], documentURL: nil)
        }
        #expect(TemplateDraftError.notMarkdown.message == "Only a Markdown document can be saved as a template.")
        #expect(TemplateDraftError.notMarkdown.detail == nil)
    }

    @Test func aDocumentThatCouldNotBeReadIsRefused() {
        #expect(throws: TemplateDraftError.unreadable) {
            try UserLibrary.draft(isHTML: false, markdown: nil, assets: [], documentURL: nil)
        }
        #expect(TemplateDraftError.unreadable.message == "The document could not be read, so it was not saved as a template.")
    }

    @Test func imagesThatBreakTheTemplateRulesAreRefusedWithTheReason() throws {
        let error = try #require(throws: TemplateDraftError.self) {
            try UserLibrary.draft(isHTML: false, markdown: "text", assets: ["../outside.png"], documentURL: nil)
        }
        #expect(error.message == "This document cannot be saved as a template.")
        #expect(error.detail?.isEmpty == false)
    }

    @Test func anHTMLDocumentIsRefusedBeforeItsImagesAreChecked() {
        #expect(throws: TemplateDraftError.notMarkdown) {
            try UserLibrary.draft(isHTML: true, markdown: "x", assets: ["../outside.png"], documentURL: nil)
        }
    }
}
