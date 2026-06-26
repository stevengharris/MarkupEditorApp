//
//  MarkupDocument.swift
//  MarkupEditorApp
//

import Foundation
import Observation

internal import UniformTypeIdentifiers

enum DocumentError: Error {
    case unknownType
    case noCurrentURL
}

enum DocumentType: String, CaseIterable {
    case html
    case md
    case htmd
    
    func ext() -> String {
        return rawValue
    }
    
    static func forExt(_ ext: String) -> DocumentType? {
        DocumentType(rawValue: ext)
    }
    
    static func exts() -> [String] {
        DocumentType.allCases.map { $0.rawValue }
    }
    
    static func utTypes() -> [UTType] {
        exts().compactMap { ext in UTType(filenameExtension: ext) }
    }
}

@MainActor @Observable class MarkupDocument {

    var hasChanges: Bool = false
    var currentFileURL: URL?
    var activeType: DocumentType?
    var rootFilename: String = "index.html"
    var metadata: [MetadataTuple] = [] {
        didSet { hasChanges = true }
    }

    /// Reads an .htmd package: copies assets into the webview sandbox, loads metadata, and
    /// updates model state. Returns the HTML string.
    func openHtmd(at url: URL, baseUrl: URL) throws -> String {
        let rootHtmlURL = try findRootHTML(in: url)
        let html = try String(contentsOf: rootHtmlURL, encoding: .utf8)
        let filename = rootHtmlURL.lastPathComponent
        let copiedPaths = try copyPackageAssets(from: url, to: baseUrl)
        for src in localImageSrcs(in: html) {
            guard copiedPaths.contains(src) else {
                throw DocumentOpenError.missingPackageImage(src)
            }
        }
        let metadata = loadHtmdMetadata(from: url, htmlFilename: filename)
        setOpenResult(html: html, url: url, documentType: .htmd, metadata: metadata, rootFilename: filename)
        return html
    }

    /// Reads an .html file: copies referenced local images into the webview sandbox, then updates
    /// model state. Relies on a stored security-scoped bookmark for the parent directory, which
    /// handleOpen stores using the NSOpenPanel powerbox grant. For .html files this works without a
    /// second panel because NSOpenPanel's powerbox grant implicitly extends to the parent directory
    /// for web-content UTIs (public.html). Throws parentSecurityScope if no bookmark is found.
    func openHtml(at url: URL, baseUrl: URL) throws -> String {
        let html = try String(contentsOf: url, encoding: .utf8)
        let srcs = localImageSrcs(in: html)
        if !srcs.isEmpty {
            if let scopedParent = resolveParentDirBookmark(for: url) {
                let accessingScoped = scopedParent.startAccessingSecurityScopedResource()
                defer { if accessingScoped { scopedParent.stopAccessingSecurityScopedResource() } }
                try copyImageAssets(srcs: srcs, from: scopedParent, to: baseUrl, skipMissing: true)
                setOpenResult(html: html, url: url, documentType: .html, metadata: [])
            } else {
                throw DocumentOpenError.parentSecurityScope(url.deletingLastPathComponent().path(percentEncoded: false))
            }
        } else {
            setOpenResult(html: html, url: url, documentType: .html, metadata: [])
        }
        return html
    }
    
    /// Opens an .md file given its pre-converted `html` and parsed `metadata`. Copies referenced
    /// local images into the webview sandbox using a stored security-scoped bookmark for the parent
    /// directory. Unlike .html, .md files (UTI: public.plain-text) do NOT receive NSOpenPanel's
    /// implicit parent-directory powerbox grant, so handleOpen must explicitly ask the user to grant
    /// directory access via a second panel and store the resulting bookmark before calling this.
    /// Throws parentSecurityScope if no bookmark is found.
    func openMd(at url: URL, baseUrl: URL, html: String, metadata: [MetadataTuple]) throws {
        let srcs = localImageSrcs(in: html)
        if !srcs.isEmpty {
            if let scopedParent = resolveParentDirBookmark(for: url) {
                let accessingScoped = scopedParent.startAccessingSecurityScopedResource()
                defer { if accessingScoped { scopedParent.stopAccessingSecurityScopedResource() } }
                try copyImageAssets(srcs: srcs, from: scopedParent, to: baseUrl, skipMissing: true)
                setOpenResult(html: html, url: url, documentType: .md, metadata: metadata)
            } else {
                throw DocumentOpenError.parentSecurityScope(url.deletingLastPathComponent().path(percentEncoded: false))
            }
        } else {
            setOpenResult(html: html, url: url, documentType: .md, metadata: metadata)
        }
    }

    /// Updates model state after a successful open. Sets hasChanges = false last
    /// to override the metadata didSet. For .htmd, pass the rootFilename returned
    /// by openHtmd; for other types it defaults to "index.html".
    private func setOpenResult(html: String, url: URL, documentType: DocumentType, metadata: [MetadataTuple], rootFilename: String = "index.html") {
        activeType = documentType
        self.rootFilename = rootFilename
        self.metadata = metadata   // triggers didSet → hasChanges = true
        currentFileURL = url
        hasChanges = false            // override didSet — must be last
    }
    
    // Inject YAML into the front of Markdown `output`, returning the new string
    func injectYAMLFrontMatter(into output: String) -> String {
        guard !metadata.isEmpty else { return output }
        let yaml = serializeYAMLMetadata(metadata)
        return "---\n\(yaml)---\n\n\(output)"
    }

    /// Saves HTML and images to the document's current URL. Handles .htmd and .html only;
    /// plugin saves are plugin-driven and handled entirely by the view.
    func save(html: String, srcs: [String], baseUrl: URL) throws {
        guard let fileExtension = activeType?.ext() else { throw DocumentError.unknownType }
        guard let url = currentFileURL else { throw DocumentError.noCurrentURL }
        switch fileExtension {
        case "htmd":
            try syncImageAssets(srcs: srcs, baseUrl: baseUrl, docDir: url, deleteOrphans: true)
            let (preamble, bodyHtml) = extractHTMLPreamble(from: html)
            let htmdHtml = preamble.map { $0 + "\n" + bodyHtml } ?? html
            try htmdHtml.write(to: url.appendingPathComponent(rootFilename), atomically: true, encoding: .utf8)
            try saveHtmdMetadata(metadata, to: url, htmlFilename: rootFilename)
        case "html":
            try syncImageAssets(srcs: srcs, baseUrl: baseUrl, docDir: url.deletingLastPathComponent(), deleteOrphans: false)
            let (preamble, bodyHtml) = extractHTMLPreamble(from: html)
            let htmlOut = preamble.map { $0 + "\n" + bodyHtml } ?? html
            try htmlOut.write(to: url, atomically: true, encoding: .utf8)
        default:
            break
        }
        hasChanges = false
    }

    /// Writes HTML and images to a new .htmd package at the given URL (save-as).
    /// saveAsHtmd always writes "index.html" as the root, so metadata is keyed to that name.
    /// Callers must follow with `willSaveTo(url:fileExtension:)` to update document identity.
    func saveHtmd(html: String, to url: URL, srcs: [String], baseUrl: URL) throws {
        try saveAsHtmd(srcs: srcs, html: html, baseUrl: baseUrl, to: url)
        try saveHtmdMetadata(metadata, to: url, htmlFilename: "index.html")
    }

    /// Writes HTML and images to a new .html file at the given URL (save-as).
    /// Callers must follow with `willSaveTo(url:fileExtension:)` to update document identity.
    func saveHtml(html: String, to url: URL, srcs: [String], baseUrl: URL) throws {
        try saveAsHtml(srcs: srcs, html: html, baseUrl: baseUrl, to: url)
    }

    /// Updates document identity after a successful save-as. Resets rootFilename to
    /// "index.html" for .htmd because saveAsHtmd always writes that filename.
    func willSaveTo(url: URL, fileExtension: String) {
        currentFileURL = url
        activeType = DocumentType.forExt(fileExtension)
        if fileExtension == "htmd" { rootFilename = "index.html" }
        hasChanges = false
    }

    /// Resets document state for a new document. Does not clear activeFileExtension.
    /// Sets hasChanges = false last to override the metadata didSet.
    func reset() {
        currentFileURL = nil
        rootFilename = "index.html"
        metadata = []           // triggers didSet → hasChanges = true
        hasChanges = false      // override didSet — must be last
    }
}
