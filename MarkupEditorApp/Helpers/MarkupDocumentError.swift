//
//  MarkupDocumentError.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/29/26.
//

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
}
