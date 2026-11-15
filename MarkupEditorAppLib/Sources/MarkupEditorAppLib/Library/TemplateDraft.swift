//
//  TemplateDraft.swift
//  MarkupEditorAppLib
//

import Foundation

/// A document being saved as a template: its Markdown, the images it refers to, and the name to offer.
public struct TemplateDraft: Sendable, Equatable {
    public let markdown: String
    public let assets: [String]
    public let name: String

    public init(markdown: String, assets: [String], name: String) {
        self.markdown = markdown
        self.assets = assets
        self.name = name
    }
}

/// Why a document cannot be saved as a template: a message to show and, when there is one, the reason.
public enum TemplateDraftError: LocalizedError, Equatable {
    case notMarkdown
    case unreadable
    case nonconforming(String)

    public var message: String {
        switch self {
        case .notMarkdown: "Only a Markdown document can be saved as a template."
        case .unreadable: "The document could not be read, so it was not saved as a template."
        case .nonconforming: "This document cannot be saved as a template."
        }
    }

    public var detail: String? {
        if case .nonconforming(let reason) = self { return reason }
        return nil
    }

    public var errorDescription: String? { [message, detail].compactMap { $0 }.joined(separator: " ") }
}

extension UserLibrary {

    /// Checks that a document can become a template and gathers what saving it needs. The name offered is
    /// the document's file name without its extension, or empty for a document with no file yet.
    /// - Parameters:
    ///   - markdown: The document as Markdown as it would be saved now, or nil when it could not be read.
    ///   - assets: The local images the Markdown refers to.
    public static func draft(isHTML: Bool, markdown: String?, assets: [String], documentURL: URL?) throws -> TemplateDraft {
        guard !isHTML else { throw TemplateDraftError.notMarkdown }
        guard let markdown else { throw TemplateDraftError.unreadable }
        do {
            try validate(assets: assets)
        } catch {
            throw TemplateDraftError.nonconforming(error.localizedDescription)
        }
        return TemplateDraft(
            markdown: markdown, assets: assets, name: documentURL?.deletingPathExtension().lastPathComponent ?? "")
    }
}
