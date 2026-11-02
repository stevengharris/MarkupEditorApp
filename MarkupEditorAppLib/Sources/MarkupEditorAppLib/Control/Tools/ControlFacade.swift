//
//  ControlFacade.swift
//  MarkupEditorAppLib
//

import Foundation

/// What the running app does for an assistant, in every build. The app target supplies the
/// implementation; the dispatcher depends only on this, so it is testable without a web view.
@MainActor
public protocol ControlFacade {
    func documentContent(format: ContentFormat, from: Int?, limit: Int?) async throws -> DocumentContent
    func selectionContent() async throws -> SelectionContent
    func select(_ target: SelectionTarget) async throws -> SelectionResult
    func replaceBlocks(index: Int, count: Int, markdown: String, expected: [String], allowLoss: Bool) async throws -> ReplaceResult
    /// Suggests edits for the user to accept or reject; the document does not change. A refusal of one edit is in the result; a failure of the whole call (no editor, the editor's own `ok: false`) throws.
    func proposeEdits(_ edits: [SuggestedEdit]) async throws -> ProposeResult
    func listSuggestions() async throws -> SuggestionList
    func undo() async throws
    func redo() async throws
    /// Saves the open document to its existing file and returns the file's URL.
    func saveDocument() async throws -> URL
    func bundlePath() -> String
}

/// The broader control Debug builds add for testing and demos. A release build's facade does not
/// adopt this, so the dispatcher refuses every tool that needs it.
@MainActor
public protocol DeveloperControlFacade: ControlFacade {
    func appState() async throws -> JSONValue
    func markdown() async throws -> String
    func typeText(_ text: String) async throws
    func runMenuCommand(_ name: String) async throws
    func evalJS(_ script: String) async throws -> JSONValue
    func html() async throws -> String
    func screenshotEditor() async throws -> Data
}
