//
//  MarkupConversionError.swift
//  MarkupEditorAppLib
//

import Foundation

/// Errors from the conversion functions in this package: importing/exporting Markdown, running
/// an exporter plugin, and exporting PDF. Narrower than the app-side `MarkupDocumentError` --
/// only the cases these functions themselves can raise, since `MarkupDocumentError` stays
/// entirely app-side (file I/O, security scope, package structure) and can't be thrown by code
/// that doesn't know about those app-level concerns.
public enum MarkupConversionError: Error, Equatable, Sendable {
    case contentEditableNotFound
    case unexpectedImport
    case unableToImport(String)
    case unexpectedExport
    case unableToExport(String)
    case pluginReturnedNoResult(String)
    case pluginNotRegistered(name: String, registered: [String])
    case pluginProducedEmptyResult(name: String, reason: String)
    case pluginReturnedInvalidResult(String)
    case pluginReturnedUndecodableResult(name: String, raw: String)
}

extension MarkupConversionError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .contentEditableNotFound:
            return "Could not locate the editable document content in the web view."
        case .unexpectedImport:
            return "Unexpected response on import."
        case .unableToImport(let reason):
            return reason.isEmpty ? "Could not convert to HTML." : "Could not convert to HTML: \(reason)"
        case .unexpectedExport:
            return "Unexpected response on export."
        case .unableToExport(let reason):
            return reason.isEmpty ? "Could not convert to Markdown." : "Could not convert to Markdown: \(reason)"
        case .pluginReturnedNoResult(let name):
            return "Plugin '\(name)' returned no result."
        case .pluginNotRegistered(let name, let registered):
            let known = registered.isEmpty ? "No exporters are registered." : "Registered exporters: \(registered.joined(separator: ", "))."
            return "Plugin '\(name)' is not registered with the editor. \(known)"
        case .pluginProducedEmptyResult(let name, let reason):
            return reason.isEmpty
                ? "Plugin '\(name)' did not produce any output."
                : "Plugin '\(name)' did not produce any output: \(reason)"
        case .pluginReturnedInvalidResult(let name):
            return "Plugin '\(name)' returned a result that could not be decoded."
        case .pluginReturnedUndecodableResult(let name, let raw):
            return "Plugin '\(name)' returned a result that could not be understood: \(raw)"
        }
    }
}
