//
//  LibraryManifest.swift
//  MarkupEditorAppLib
//

import Foundation

/// The description of a library item, stored as `manifest.json` in the item's folder.
public struct LibraryManifest: Codable, Sendable, Equatable {
    public var name: String
    public var description: String
    /// The Markdown file to open. When nil, the folder must hold exactly one `.md` file.
    public var document: String?

    public init(name: String, description: String, document: String? = nil) {
        self.name = name
        self.description = description
        self.document = document
    }
}
