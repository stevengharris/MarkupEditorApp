//
//  HeadlessExportTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
import MarkupEditorAppLib
@testable import MarkupEditorApp

@MainActor
struct HeadlessExportTests {

    @Test func formatIsReadAfterTheFlag() {
        #expect(HeadlessExport.format(from: ["MarkupEditor", "--headless-export", "html"]) == .html)
        #expect(HeadlessExport.format(from: ["MarkupEditor", "--headless-export", "pdf"]) == .pdf)
    }

    @Test func normalLaunchHasNoFormat() {
        #expect(HeadlessExport.format(from: ["MarkupEditor"]) == nil)
        #expect(HeadlessExport.format(from: ["MarkupEditor", "--headless-export"]) == nil)
        #expect(HeadlessExport.format(from: ["MarkupEditor", "--headless-export", "docx"]) == nil)
    }

    @Test func tightenedHtmlWritesTightLists() async throws {
        let page = HeadlessTestPage()
        await page.start()
        let converted = try await MarkupConverter.importMarkdownDecoded(page.webView, content: "* one\n* two\n  * inner\n\n* three\n\n  more\n")
        let tight = await page.webView.tightenHtml(converted.result)
        #expect(tight == "<ul><li>one</li><li>two<ul><li>inner</li></ul></li><li><p>three</p><p>more</p></li></ul>")
    }
}
