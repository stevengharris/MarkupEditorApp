//
//  ControlFacade.swift
//  MarkupEditorAppLib
//

import Foundation

/// What the running app can do for the control channel. The app target supplies the implementation;
/// the dispatcher depends only on this, so it is testable without a web view.
@MainActor
public protocol ControlFacade {
    func appState() async throws -> JSONValue
    func saveDocument() async throws
    func runMenuCommand(_ name: String) async throws
    func evalJS(_ script: String) async throws -> JSONValue
    func markdown() async throws -> String
    func html() async throws -> String
    func typeText(_ text: String) async throws
    func screenshotEditor() async throws -> Data
}
