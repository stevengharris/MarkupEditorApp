//
//  MarkupDocumentError.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/29/26.
//

import Foundation

enum MarkupDocumentError: Error, Equatable {
    case ambiguousRootHtml(Int)
    case contentEditableNotFound
    case couldNotPrepareFile(String)
    case couldNotReadFile(String)
    case couldNotSetHTML
    case missingImage(String)
    case noWebViewAvailable
    case noHTMLSource
    case noMarkdownSource
    case parentSecurityScope(String)
    case rootHtmlNotFound
    case unexpectedImport
    case unableToImport
    case unexpectedExport
    case unableToExport
}

extension MarkupDocumentError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .ambiguousRootHtml(let n):         return "Package contains \(n) HTML files; expected exactly one."
        case .contentEditableNotFound:          return "Could not locate the editable document content in the web view."
        case .couldNotPrepareFile(let err):     return "Could not prepare the file: \(err)"
        case .couldNotReadFile(let err):        return "Could not read the file: \(err)"
        case .couldNotSetHTML:                  return "HTML was not available to set."
        case .missingImage(let src):            return "Missing image asset: \(src)"
        case .noWebViewAvailable:               return "No web view is available."
        case .noHTMLSource:                     return "No HTML source is available."
        case .noMarkdownSource:                 return "No Markdown source is available."
        case .parentSecurityScope(let path):    return "Could not access parent directory: \(path)"
        case .rootHtmlNotFound:                 return "No HTML file found in package."
        case .unexpectedImport:                 return "Unexpected response on import."
        case .unableToImport:                   return "Could not convert to HTML."
        case .unexpectedExport:                 return "Unexpected response on export."
        case .unableToExport:                   return "Could not convert to Markdown."
        }
    }
}
