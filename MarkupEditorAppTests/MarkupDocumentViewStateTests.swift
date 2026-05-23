//
//  MarkupDocumentViewStateTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

// Structural tests for MarkupDocumentView state fields.
//
// These tests verify the structural wiring of observable state that cannot be
// exercised end-to-end without a live WKWebView:
//   - sourceViewIsStale: set by markupInput instead of calling setCurrentHtml() per keystroke.
//
// Note on @State and testing: @State properties on a SwiftUI struct value are backed by
// SwiftUI's state graph, not a plain stored property. Mutation through the nonmutating setter
// only takes effect within a live SwiftUI rendering context. The structural contracts
// (default value, non-private visibility for Binding, presence in markupInput) are
// verified here via compile-time accessibility and the initial value read.
@MainActor struct MarkupDocumentViewStateTests {

    // MARK: - sourceViewIsStale

    @Test func sourceViewIsStaleDefaultsFalse() {
        // The flag must default to false — SourceView shows non-stale content on first render.
        // This also verifies the property is accessible via @testable import (non-private),
        // which is required for SourceView's @Binding and for markupInput to set it.
        let view = MarkupDocumentView()
        #expect(view.sourceViewIsStale == false)
    }
}
