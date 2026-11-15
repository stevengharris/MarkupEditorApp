//
//  TemplateOpening.swift
//  MarkupEditorApp
//

import Foundation
import MarkupEditorAppLib

/// A template's document, converted and with its images in place, ready to replace the current document.
struct PreparedTemplate {
    let markdown: String
    let html: String
    let metadata: [MetadataTuple]
}

enum TemplateOpening {

    /// Does everything that can fail when a template becomes the document, without touching the document:
    /// finds and reads the template's Markdown, converts it, and copies its images into `destination`. A
    /// throw here leaves the current document alone, so the caller replaces it only after this returns.
    /// A template image that is missing is skipped.
    /// - Parameter importer: Converts the Markdown to HTML and metadata, as the editor does.
    @MainActor
    static func prepare(
        _ item: UserLibraryItem,
        document: MarkupDocument,
        imagesTo destination: URL,
        importer: (String) async throws -> (html: String, metadata: [MetadataTuple])
    ) async throws -> PreparedTemplate {
        let documentURL = try item.documentURL()
        let markdown = try String(contentsOf: documentURL, encoding: .utf8)
        let (html, metadata) = try await importer(markdown)
        try document.copyImageAssets(
            srcs: document.localImageSrcsInMarkdown(markdown), from: documentURL.deletingLastPathComponent(),
            to: destination, skipMissing: true, replaceExisting: true)
        return PreparedTemplate(markdown: markdown, html: html, metadata: metadata)
    }
}
