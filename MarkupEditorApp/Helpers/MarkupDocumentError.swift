//
//  MarkupDocumentError.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/29/26.
//

import Foundation

enum MarkupDocumentError: Error, Equatable {
    case contentEditableNotFound
    case couldNotPrepareFile(String)
    case couldNotReadFile(String)
    case couldNotSetHTML
    case missingImage(String)
    case noWebViewAvailable
    case noHTMLSource
    case noMarkdownSource
    case parentSecurityScope(String)
    case pluginProducedEmptyResult(name: String, reason: String)
    case pluginReturnedInvalidResult(String)
    case pluginReturnedNoResult(String)
    case pluginReturnedUndecodableResult(name: String, raw: String)
    case unexpectedImport
    case unableToImport(String)
    case unexpectedExport
    case unableToExport(String)
}

extension MarkupDocumentError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .contentEditableNotFound:          return "Could not locate the editable document content in the web view."
        case .couldNotPrepareFile(let err):     return "Could not prepare the file: \(err)"
        case .couldNotReadFile(let err):        return "Could not read the file: \(err)"
        case .couldNotSetHTML:                  return "HTML was not available to set."
        case .missingImage(let src):            return "Missing image asset: \(src)"
        case .noWebViewAvailable:               return "No web view is available."
        case .noHTMLSource:                     return "No HTML source is available."
        case .noMarkdownSource:                 return "No Markdown source is available."
        case .parentSecurityScope(let path):    return "Could not access parent directory: \(path)"
        case .pluginProducedEmptyResult(let name, let reason):
            return reason.isEmpty
                ? "Plugin '\(name)' did not produce any output."
                : "Plugin '\(name)' did not produce any output: \(reason)"
        case .pluginReturnedInvalidResult(let name):      return "Plugin '\(name)' returned a result that could not be decoded."
        case .pluginReturnedNoResult(let name):           return "Plugin '\(name)' returned no result."
        case .pluginReturnedUndecodableResult(let name, let raw):
            return "Plugin '\(name)' returned a result that could not be understood: \(raw)"
        case .unexpectedImport:                 return "Unexpected response on import."
        case .unableToImport(let reason):
            return reason.isEmpty ? "Could not convert to HTML." : "Could not convert to HTML: \(reason)"
        case .unexpectedExport:                 return "Unexpected response on export."
        case .unableToExport(let reason):
            return reason.isEmpty ? "Could not convert to Markdown." : "Could not convert to Markdown: \(reason)"
        }
    }
}
