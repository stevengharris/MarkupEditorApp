//
//  OpenURLRoute.swift
//  MarkupEditorApp
//

import Foundation
import MarkupEditorAppLib

/// Where a URL the app is asked to open goes: a Shortcut callback, or a document.
enum OpenURLRoute: Equatable {
    case shortcutCallback
    case document

    static func route(for url: URL) -> OpenURLRoute {
        ShortcutCallbackURL.handles(url) ? .shortcutCallback : .document
    }

    /// Hands a Shortcut callback to `runs` and returns. Any other URL goes to `openDocument`, so a
    /// callback never reaches the document-opening path.
    @MainActor
    static func dispatch(_ url: URL, runs: ShortcutRunStore = .shared, openDocument: (URL) -> Void) {
        switch route(for: url) {
        case .shortcutCallback: runs.receive(url)
        case .document: openDocument(url)
        }
    }
}
