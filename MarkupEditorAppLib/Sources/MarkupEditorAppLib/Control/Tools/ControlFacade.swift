//
//  ControlFacade.swift
//  MarkupEditorAppLib
//

import Foundation

/// What the running app does for an assistant, in every build. The app target supplies the
/// implementation; the dispatcher depends only on this, so it is testable without a web view.
@MainActor
public protocol ControlFacade {
    func appState() async throws -> JSONValue
    func markdown() async throws -> String
    func typeText(_ text: String) async throws
    func selectionText() async throws -> String
    func bundlePath() -> String
}

/// The broader control Debug builds add for testing and demos. A release build's facade does not
/// adopt this, so the dispatcher refuses every tool that needs it.
@MainActor
public protocol DeveloperControlFacade: ControlFacade {
    func saveDocument() async throws
    func runMenuCommand(_ name: String) async throws
    func evalJS(_ script: String) async throws -> JSONValue
    func html() async throws -> String
    func screenshotEditor() async throws -> Data
}
