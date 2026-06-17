//
//  MarkupDocument.swift
//  MarkupEditorApp
//

import Foundation
import Observation

enum DocumentError: Error {
    case unknownType
    case noCurrentURL
}

@MainActor @Observable class MarkupDocument {

    var hasChanges: Bool = false
    var currentFileURL: URL?
    var activeDocumentType: DocumentType?
    var rootHtmlFilename: String = "index.html"
    var documentMetadata: [MetadataTuple] = [] {
        didSet { hasChanges = true }
    }

    /// Reads an .htmd package: copies assets into the webview sandbox, loads metadata.
    /// Returns the HTML string and parsed metadata; does not update model state.
    /// Callers must follow with `setOpenResult(html:url:type:metadata:)`.
    func openHtmd(at url: URL, baseUrl: URL) throws -> (html: String, metadata: [MetadataTuple]) {
        let rootHtmlURL = try findRootHTML(in: url)
        let html = try String(contentsOf: rootHtmlURL, encoding: .utf8)
        rootHtmlFilename = rootHtmlURL.lastPathComponent
        let copiedPaths = try copyPackageAssets(from: url, to: baseUrl)
        for src in localImageSrcs(in: html) {
            guard copiedPaths.contains(src) else {
                throw DocumentOpenError.missingPackageImage(src)
            }
        }
        let metadata = loadHtmdMetadata(from: url, htmlFilename: rootHtmlFilename)
        return (html, metadata)
    }

    /// Reads an .html file: copies referenced local images into the webview sandbox.
    /// Returns the HTML string; does not update model state.
    /// Callers must follow with `setOpenResult(html:url:type:metadata:)`.
    func openHtml(at url: URL, baseUrl: URL) throws -> String {
        let html = try String(contentsOf: url, encoding: .utf8)
        let parentDir = url.deletingLastPathComponent()
        let srcs = localImageSrcs(in: html)
        if !srcs.isEmpty {
            let scopedParent = resolveParentDirBookmark(for: url)
            let accessingScoped = scopedParent?.startAccessingSecurityScopedResource() ?? false
            defer { if accessingScoped { scopedParent?.stopAccessingSecurityScopedResource() } }
            try copyImageAssets(srcs: srcs, from: parentDir, to: baseUrl, skipMissing: true)
            storeParentDirBookmark(for: url)
        }
        return html
    }

    /// Updates model state after a successful open (any type). Sets hasChanges = false last
    /// to override the documentMetadata didSet.
    func setOpenResult(html: String, url: URL, type: DocumentType, metadata: [MetadataTuple]) {
        activeDocumentType = type
        documentMetadata = metadata   // triggers didSet → hasChanges = true
        currentFileURL = url
        hasChanges = false            // override didSet — must be last
    }

    /// Saves HTML and images to the document's current URL. Handles .htmd and .html only;
    /// .md saves are plugin-driven and handled entirely by the view.
    func save(html: String, srcs: [String], baseUrl: URL) throws {
        guard let type = activeDocumentType else { throw DocumentError.unknownType }
        guard let url = currentFileURL else { throw DocumentError.noCurrentURL }
        switch type {
        case .htmd:
            try syncImageAssets(srcs: srcs, baseUrl: baseUrl, docDir: url, deleteOrphans: true)
            let (preamble, bodyHtml) = extractHTMLPreamble(from: html)
            let htmdHtml = preamble.map { $0 + "\n" + bodyHtml } ?? html
            try htmdHtml.write(to: url.appendingPathComponent(rootHtmlFilename), atomically: true, encoding: .utf8)
            try saveHtmdMetadata(documentMetadata, to: url, htmlFilename: rootHtmlFilename)
        case .html:
            try syncImageAssets(srcs: srcs, baseUrl: baseUrl, docDir: url.deletingLastPathComponent(), deleteOrphans: false)
            let (preamble, bodyHtml) = extractHTMLPreamble(from: html)
            let htmlOut = preamble.map { $0 + "\n" + bodyHtml } ?? html
            try htmlOut.write(to: url, atomically: true, encoding: .utf8)
        case .md:
            break
        }
        hasChanges = false
    }

    /// Writes HTML and images to a new .htmd package at the given URL (save-as).
    /// Callers must follow with `willSaveTo(url:as:)` to update document identity.
    func saveHtmd(html: String, to url: URL, srcs: [String], baseUrl: URL) throws {
        try saveAsHtmd(srcs: srcs, html: html, baseUrl: baseUrl, to: url)
        try saveHtmdMetadata(documentMetadata, to: url, htmlFilename: rootHtmlFilename)
    }

    /// Writes HTML and images to a new .html file at the given URL (save-as).
    /// Callers must follow with `willSaveTo(url:as:)` to update document identity.
    func saveHtml(html: String, to url: URL, srcs: [String], baseUrl: URL) throws {
        try saveAsHtml(srcs: srcs, html: html, baseUrl: baseUrl, to: url)
    }

    /// Updates document identity after a successful save-as.
    func willSaveTo(url: URL, as type: DocumentType) {
        currentFileURL = url
        activeDocumentType = type
        hasChanges = false
    }

    /// Resets document state for a new document. Does not clear activeDocumentType.
    /// Sets hasChanges = false last to override the documentMetadata didSet.
    func reset() {
        currentFileURL = nil
        rootHtmlFilename = "index.html"
        documentMetadata = []    // triggers didSet → hasChanges = true
        hasChanges = false       // override didSet — must be last
    }
}
