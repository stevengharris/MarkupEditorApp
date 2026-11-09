//
//  LibraryError.swift
//  MarkupEditorAppLib
//

import Foundation

public enum LibraryError: LocalizedError, Equatable {
    case noDocument(String)
    case ambiguousDocument(String)
    case emptyName
    case notInLibrary
    case unsupportedSource(String)
    case invalidFolder([String])

    public var errorDescription: String? {
        switch self {
        case .noDocument(let name): "\(name) has no Markdown document."
        case .ambiguousDocument(let name): "\(name) has more than one Markdown file and its manifest does not say which to open."
        case .emptyName: "A template needs a name."
        case .notInLibrary: "That item is not in the templates folder."
        case .unsupportedSource(let name): "\(name) is not a Markdown file or a folder."
        case .invalidFolder(let problems): "This cannot be a template:\n" + problems.map { "• \($0)" }.joined(separator: "\n")
        }
    }
}
