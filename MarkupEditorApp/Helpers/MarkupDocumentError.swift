//
//  MarkupDocumentError.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/29/26.
//

import Foundation

enum MarkupDocumentError: Error, Equatable {
    case unknownType
    case noCurrentURL
    case noRootFilename
    case rootHtmlNotFound
    case ambiguousRootHtml(Int)
    case missingImage(String)
    case noWebViewAvailable
    case parentSecurityScope(String)
    case unexpectedImport
    case unableToImport
    case unexpectedExport
    case unableToExport
    case couldNotReadFile(String)
    case couldNotPrepareFile(String)
}

extension MarkupDocumentError: LocalizedError {
    var errorDescription: String? {
        switch self {
        case .unknownType:                      return "Unknown document type."
        case .noCurrentURL:                     return "No current document URL."
        case .noRootFilename:                   return "Could not determine root filename."
        case .rootHtmlNotFound:                 return "No HTML file found in package."
        case .ambiguousRootHtml(let n):         return "Package contains \(n) HTML files; expected exactly one."
        case .missingImage(let src):            return "Missing image asset: \(src)"
        case .noWebViewAvailable:               return "No web view is available."
        case .parentSecurityScope(let path):    return "Could not access parent directory: \(path)"
        case .unexpectedImport:                 return "Unexpected response on import."
        case .unableToImport:                   return "Could not convert to HTML."
        case .unexpectedExport:                 return "Unexpected response on export."
        case .unableToExport:                   return "Could not convert to Markdown."
        case .couldNotReadFile(let err):        return "Could not read the file: \(err)"
        case .couldNotPrepareFile(let err):     return "Could not prepare the file: \(err)"
        }
    }
}
