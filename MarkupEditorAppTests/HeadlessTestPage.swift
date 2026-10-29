//
//  HeadlessTestPage.swift
//  MarkupEditorAppTests
//

import Foundation
import MarkupEditor
@testable import MarkupEditorApp

/// Holds a MarkupWKWebView instance through to its "ready" state, headlessly -- no SwiftUI, no
/// document model. Mirrors MarkupEditor's own HtmlTestPage.swift.
@MainActor
class HeadlessTestPage: MarkupDelegate {
    var webView: MarkupWKWebView!
    private var coordinator: MarkupCoordinator!
    private var continuation: CheckedContinuation<Void, Never>?

    func start() async {
        let configuration = MarkupWKWebViewConfiguration()
        configuration.userScriptFile = "markupeditor-app.js"
        configuration.delegate = "MarkupEditorDelegate"
        await withCheckedContinuation { continuation in
            self.continuation = continuation
            webView = MarkupWKWebView(markupDelegate: self, configuration: configuration)
            coordinator = MarkupCoordinator(markupDelegate: self, webView: webView)
            webView.setCoordinatorConfiguration(coordinator)
        }
    }

    /// How many times the editor reported an input, as the host sees a user edit.
    private(set) var inputCount = 0

    func markupInput(_ view: MarkupWKWebView) {
        inputCount += 1
        AppControl.shared.document?.hasChanges = true   // as MarkupDocumentView does for a user edit
    }

    /// How many settle markers reached the host. A marker is a message the page posts as an input in the
    /// div "barrier", which the host counts here and does not read as an edit.
    private(set) var barrierCount = 0

    func markupInput(_ view: MarkupWKWebView, divId: String) {
        if divId == "barrier" { barrierCount += 1 }
    }

    func markupDidLoad(_ view: MarkupWKWebView, handler: (() -> Void)?) {
        continuation?.resume()
        continuation = nil
    }
}
