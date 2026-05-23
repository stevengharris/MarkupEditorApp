//
//  SourceViewTests.swift
//  MarkupEditorAppTests
//
//  Tests for SourceView header label derivation from DocumentType.
//
//  Button presence cannot be tested without ViewInspector (a dependency we don't have).
//  Instead, `headerText` is left `internal` (not `private`) so the computed property
//  can be verified directly via @testable import. The Refresh button visibility logic
//  (`if sourceViewIsStale`) is a structural one-liner in the view body — coverage is
//  provided by the `sourceViewIsStale` state tests in MarkupDocumentViewStateTests.

import Testing
import SwiftUI
@testable import MarkupEditorApp

@MainActor struct SourceViewTests {

    // MARK: - headerText derivation

    @Test func sourceViewLabelIsHtmlForNilDocType() {
        let view = SourceView(
            currentHtml: .constant(""),
            sourceViewIsStale: .constant(false),
            docType: nil
        )
        #expect(view.headerText == "HTML Document")
    }

    @Test func sourceViewLabelIsHtmlForHtmlDocType() {
        let view = SourceView(
            currentHtml: .constant(""),
            sourceViewIsStale: .constant(false),
            docType: .html
        )
        #expect(view.headerText == "HTML Document")
    }

    @Test func sourceViewLabelIsHtmlForHtmdDocType() {
        let view = SourceView(
            currentHtml: .constant(""),
            sourceViewIsStale: .constant(false),
            docType: .htmd
        )
        #expect(view.headerText == "HTML Document")
    }

    @Test func sourceViewLabelIsMdForMdDocType() {
        let view = SourceView(
            currentHtml: .constant(""),
            sourceViewIsStale: .constant(false),
            docType: .md
        )
        #expect(view.headerText == "Markdown Document")
    }
}
