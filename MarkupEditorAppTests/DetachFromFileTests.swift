//
//  DetachFromFileTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor
struct DetachFromFileTests {

    @Test func aMarkdownDocumentBecomesUntitledAndChanged() {
        let document = MarkupDocument()
        document.url = URL(fileURLWithPath: "/tmp/a.md")
        document.hasChanges = false
        document.detachFromFile()
        #expect(document.url == nil)
        #expect(document.documentType == .md)
        #expect(document.hasChanges)
    }

    @Test func anHTMLDocumentKeepsItsType() {
        let document = MarkupDocument()
        document.url = URL(fileURLWithPath: "/tmp/a.html")
        #expect(document.documentType == .html)
        document.detachFromFile()
        #expect(document.url == nil)
        #expect(document.documentType == .html)
    }
}
