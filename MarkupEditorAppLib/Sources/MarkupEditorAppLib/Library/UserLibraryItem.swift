//
//  UserLibraryItem.swift
//  MarkupEditorAppLib
//

import Foundation

/// One folder in a library: its manifest and the files it holds.
public struct UserLibraryItem: Identifiable, Sendable, Equatable {
    public static let manifestName = "manifest.json"

    public let url: URL
    public let manifest: LibraryManifest
    public var id: String { url.lastPathComponent }

    public init(url: URL, manifest: LibraryManifest) {
        self.url = url
        self.manifest = manifest
    }

    /// The Markdown document the item opens.
    public func documentURL() throws -> URL {
        if let document = manifest.document {
            return url.appendingPathComponent(document)
        }
        let files = (try? FileManager.default.contentsOfDirectory(at: url, includingPropertiesForKeys: nil)) ?? []
        let markdown = files.filter { $0.pathExtension.lowercased() == "md" }
        switch markdown.count {
        case 1: return markdown[0]
        case 0: throw LibraryError.noDocument(manifest.name)
        default: throw LibraryError.ambiguousDocument(manifest.name)
        }
    }
}
