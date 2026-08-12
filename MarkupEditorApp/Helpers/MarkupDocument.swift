//
//  MarkupDocument.swift
//  MarkupEditorApp
//

import Foundation
import Observation

/**
 One of the challenges with MarkupDocument is that its source can be either HTML or Markdown. However, to
 derive Markdown from HTML requires using a MarkupWKWebView call to exportMarkdown, and I don't want
 MarkupDocument to reference UI components, and I generally want to access everything in it synchronously.
 
 We have to handle the situation where the MarkupDocument represents the contents of url as
 well as the situation where we have no associated the contents with any URL. Thus:
 1. When we set the URL, we set the documentType based on the url (.html, .md, or .htmd)
 2.
 */
@Observable class MarkupDocument {
    
    static let emptyMarkdown = ""
    static let emptyHTML = "<p></p>"
    
    var hasChanges: Bool = false
    var url: URL? {
        didSet { documentType = DocumentType.for(url: url) ?? .md }
    }
    private(set) var source: String {
        get { isHTMLish ? html : markdown }
        set(value) { if isHTMLish { html = value } else { markdown = value }}
    }
    private var html: String
    private var markdown: String
    var documentType: DocumentType = .md
    var metadata: [MetadataTuple] = [] {
        didSet { hasChanges = true }
    }
    var isHTMLish: Bool { documentType == .html || documentType == .htmd }
    
    func setSource(_ source: String, documentType: DocumentType? = nil) {
        self.source = source
        if let documentType { self.documentType = documentType }
    }
    
    init() {
        html = Self.emptyHTML
        markdown = Self.emptyMarkdown
    }

    // MARK: - Open

    /// Reads an .htmd package: copies assets into the webview sandbox, loads metadata, and
    /// updates model state. Returns the HTML string.
    func openHtmd(at url: URL, baseUrl: URL) throws -> String {
        let rootHtmlURL = try findRootHTML(in: url)
        let html = try String(contentsOf: rootHtmlURL, encoding: .utf8)
        let filename = rootHtmlURL.lastPathComponent
        let copiedPaths = try copyPackageAssets(from: url, to: baseUrl)
        for src in localImageSrcs(in: html) {
            guard copiedPaths.contains(src) else {
                throw MarkupDocumentError.missingImage(src)
            }
        }
        let metadata = loadHtmdMetadata(from: url, htmlFilename: filename)
        setOpenResult(source: html, url: url, metadata: metadata)
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
                try copyImageAssets(srcs: srcs, from: scopedParent, to: baseUrl, skipMissing: true, replaceExisting: true)
                setOpenResult(source: html, url: url, metadata: [])
            } else {
                throw MarkupDocumentError.parentSecurityScope(url.deletingLastPathComponent().path(percentEncoded: false))
            }
        } else {
            setOpenResult(source: html, url: url, metadata: [])
        }
        return html
    }

    /// Opens an .md file given its pre-converted `markdown` and parsed `metadata`. Copies referenced
    /// local images into the webview sandbox using a stored security-scoped bookmark for the parent
    /// directory. Unlike .html, .md files (UTI: public.plain-text) do NOT receive NSOpenPanel's
    /// implicit parent-directory powerbox grant, so handleOpen must explicitly ask the user to grant
    /// directory access via a second panel and store the resulting bookmark before calling this.
    /// Throws parentSecurityScope if no bookmark is found.
    func openMd(at url: URL, baseUrl: URL, markdown: String, metadata: [MetadataTuple]) throws {
        let srcs = localImageSrcs(in: markdown)
        if !srcs.isEmpty {
            if let scopedParent = resolveParentDirBookmark(for: url) {
                let accessingScoped = scopedParent.startAccessingSecurityScopedResource()
                defer { if accessingScoped { scopedParent.stopAccessingSecurityScopedResource() } }
                try copyImageAssets(srcs: srcs, from: scopedParent, to: baseUrl, skipMissing: true, replaceExisting: true)
                setOpenResult(source: markdown, url: url, metadata: metadata)
            } else {
                throw MarkupDocumentError.parentSecurityScope(url.deletingLastPathComponent().path(percentEncoded: false))
            }
        } else {
            setOpenResult(source: markdown, url: url, metadata: metadata)
        }
    }

    /// Updates model state after a successful open. Sets hasChanges = false last
    /// to override the metadata didSet.
    private func setOpenResult(source: String, url: URL, metadata: [MetadataTuple]) {
        self.url = url              // Sets documentType based on url
        self.source = source        // Sets html or markdown based on documentType
        self.metadata = metadata    // triggers didSet → hasChanges = true
        hasChanges = false          // override didSet — must be last
    }
    
    /// Return the rootFilename for url; e.g., return "foo.html" when url ends in "foo.htmd" or "foo.html".
    private func rootFilename() -> String {
        guard let url, isHTMLish else { return "index.html" }
        return url.deletingPathExtension().appendingPathExtension("html").lastPathComponent
    }

    private func findRootHTML(in packageURL: URL) throws -> URL {
        let contents = try FileManager.default.contentsOfDirectory(
            at: packageURL,
            includingPropertiesForKeys: nil,
            options: .skipsHiddenFiles
        )
        let htmlFiles = contents.filter { $0.pathExtension.lowercased() == "html" }
        guard !htmlFiles.isEmpty else { throw MarkupDocumentError.rootHtmlNotFound }
        guard htmlFiles.count == 1 else { throw MarkupDocumentError.ambiguousRootHtml(htmlFiles.count) }
        return htmlFiles[0]
    }

    // MARK: - Save

    /// Creates a fresh .htmd package at `url`, writes `html` to rootFileName(), copies image assets,
    /// and writes metadata. If a package already exists at `url` it is replaced.
    func saveHtmd(html: String, to url: URL, srcs: [String], baseUrl: URL) throws {
        let fm = FileManager.default
        if fm.fileExists(atPath: url.path(percentEncoded: false)) {
            try fm.removeItem(at: url)
        }
        try fm.createDirectory(at: url, withIntermediateDirectories: true)
        try html.write(to: url.appending(path: rootFilename(), directoryHint: .notDirectory), atomically: true, encoding: .utf8)
        try syncPackageAssets(srcs: srcs, baseUrl: baseUrl, to: url, deleteOrphans: true)
        try saveHtmdMetadata(metadata, to: url)
        self.url = url
        hasChanges = false
    }

    /// Writes `html` to a new .html file at `url` and copies image assets alongside it.
    /// Does not delete any existing files.
    func saveHtml(html: String, to url: URL, srcs: [String], baseUrl: URL) throws {
        try html.write(to: url, atomically: true, encoding: .utf8)
        try copyImageAssets(srcs: srcs, from: baseUrl, to: url.deletingLastPathComponent(), skipMissing: true, replaceExisting: false)
        self.url = url
        hasChanges = false
    }
    
    func saveMd(markdown: String, to url: URL, srcs: [String], baseUrl: URL) throws {
        let annotatedMarkdown = injectYAMLFrontMatter(into: markdown)
        try annotatedMarkdown.write(to: url, atomically: true, encoding: .utf8)
        try copyImageAssets(srcs: srcs, from: baseUrl, to: url.deletingLastPathComponent(), skipMissing: true, replaceExisting: false)
        self.url = url
        hasChanges = false
    }

    /// Resets document state for a new document. Sets hasChanges = false last to override the metadata didSet.
    func reset() {
        url = nil
        metadata = []           // triggers didSet → hasChanges = true
        hasChanges = false      // override didSet — must be last
    }

    /// Syncs image assets from `baseUrl` into `docDir`.
    /// Copies each src that is missing from `docDir`; skips srcs absent from `baseUrl`.
    /// When `deleteOrphans` is true, removes non-HTML files in `docDir` whose relative path
    /// is not present in `srcs` (used for .htmd saves to remove deleted images).
    func syncPackageAssets(srcs: [String], baseUrl: URL, to docDir: URL, deleteOrphans: Bool) throws {
        let fm = FileManager.default
        let srcSet = Set(srcs)
        for src in srcs {
            let dest = docDir.appendingPathComponent(src)
            guard !fm.fileExists(atPath: dest.path(percentEncoded: false)) else { continue }
            let source = baseUrl.appendingPathComponent(src)
            guard fm.fileExists(atPath: source.path(percentEncoded: false)) else { continue }
            let parent = dest.deletingLastPathComponent()
            if !fm.fileExists(atPath: parent.path(percentEncoded: false)) {
                try fm.createDirectory(at: parent, withIntermediateDirectories: true)
            }
            try fm.copyItem(at: source, to: dest)
        }
        guard deleteOrphans else { return }
        guard let enumerator = fm.enumerator(
            at: docDir,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else { return }
        var docDirPath = docDir.path(percentEncoded: false)
        if docDirPath.hasSuffix("/") { docDirPath.removeLast() }
        for case let fileURL as URL in enumerator {
            let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey])
            guard values.isRegularFile == true else { continue }
            let ext = fileURL.pathExtension.lowercased()
            guard ext != "html" else { continue }
            // Preserve spec-defined non-image package files regardless of image-srcs list.
            let preservedExtensions: Set<String> = ["data", "css", "htmd"]
            guard !preservedExtensions.contains(ext) else { continue }
            let relativePath = String(fileURL.path(percentEncoded: false).dropFirst(docDirPath.count + 1))
            if !srcSet.contains(relativePath) {
                try fm.removeItem(at: fileURL)
            }
        }
    }

    private func applyPreamble(to html: String) -> String {
        let (preamble, body) = extractHTMLPreamble(from: html)
        return preamble.map { $0 + "\n" + body } ?? html
    }

    // MARK: - Image assets

    /// Copies `sourceDir/<src>` to `destDir/<src>` for each src, creating subdirectories as needed.
    /// When `skipMissing` is true, files absent from sourceDir are silently ignored.
    /// When false, a missing file throws `MarkupDocumentError.missingPackageImage`.
    func copyImageAssets(srcs: [String], from sourceDir: URL, to destDir: URL, skipMissing: Bool, replaceExisting: Bool) throws {
        let fm = FileManager.default
        for src in srcs {
            let source = sourceDir.appendingPathComponent(src)
            let dest = destDir.appendingPathComponent(src)
            guard fm.fileExists(atPath: source.path(percentEncoded: false)) else {
                if skipMissing { continue }
                throw MarkupDocumentError.missingImage(src)
            }
            let parent = dest.deletingLastPathComponent()
            if !fm.fileExists(atPath: parent.path(percentEncoded: false)) {
                try fm.createDirectory(at: parent, withIntermediateDirectories: true)
            }
            if fm.fileExists(atPath: dest.path(percentEncoded: false)) {
                if !replaceExisting { continue }
                try fm.removeItem(at: dest)
                try fm.copyItem(at: source, to: dest)
            } else {
                try fm.copyItem(at: source, to: dest)
            }
        }
    }

    /// Copies all non-HTML files from `packageURL` into `destDir`, preserving relative paths.
    /// Returns the set of relative paths that were copied.
    func copyPackageAssets(from packageURL: URL, to destDir: URL) throws -> Set<String> {
        let fm = FileManager.default
        guard let enumerator = fm.enumerator(
            at: packageURL,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }
        var pkgPath = packageURL.path(percentEncoded: false)
        if pkgPath.hasSuffix("/") { pkgPath.removeLast() }
        var copied = Set<String>()
        for case let fileURL as URL in enumerator {
            let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey])
            guard values.isRegularFile == true else { continue }
            guard fileURL.pathExtension.lowercased() != "html" else { continue }
            let relativePath = String(fileURL.path(percentEncoded: false).dropFirst(pkgPath.count + 1))
            let dest = destDir.appendingPathComponent(relativePath)
            let parent = dest.deletingLastPathComponent()
            if !fm.fileExists(atPath: parent.path(percentEncoded: false)) {
                try fm.createDirectory(at: parent, withIntermediateDirectories: true)
            }
            if fm.fileExists(atPath: dest.path(percentEncoded: false)) {
                try fm.removeItem(at: dest)
            }
            try fm.copyItem(at: fileURL, to: dest)
            copied.insert(relativePath)
        }
        return copied
    }

    // MARK: - Image sources

    /// Returns the literal `src` attribute values from `<img>` tags that are local relative paths.
    /// Excludes http://, https://, data:, //, and absolute paths starting with /.
    func localImageSrcs(in html: String) -> [String] {
        let pattern = #"(?i)<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let nsHtml = html as NSString
        let range = NSRange(location: 0, length: nsHtml.length)
        return regex.matches(in: html, range: range).compactMap { match -> String? in
            guard match.numberOfRanges > 1 else { return nil }
            let srcRange = match.range(at: 1)
            guard srcRange.location != NSNotFound else { return nil }
            let src = nsHtml.substring(with: srcRange)
            return isLocalRelativeSrc(src) ? src : nil
        }
    }

    func localImageSrcsInMarkdown(_ content: String) -> [String] {
        // Strip code regions first — image syntax inside code spans/blocks is literal text,
        // not a real image reference.
        var stripped = content
        let stripPatterns = [
            #"```[\s\S]*?```"#,  // fenced code blocks (backtick)
            #"~~~[\s\S]*?~~~"#,  // fenced code blocks (tilde)
            #"`[^`\n]+`"#,       // inline code spans
        ]
        for pattern in stripPatterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            stripped = regex.stringByReplacingMatches(
                in: stripped,
                range: NSRange(stripped.startIndex..., in: stripped),
                withTemplate: ""
            )
        }
        let nsStripped = stripped as NSString
        let fullRange = NSRange(location: 0, length: nsStripped.length)
        var srcs = Set<String>()
        let patterns = [
            #"!\[[^\]]*\]\(([^\s)]+)"#,                        // ![alt](path)
            #"(?i)<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["']"#  // <img src="path">
        ]
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            for match in regex.matches(in: stripped, range: fullRange) {
                guard match.numberOfRanges > 1 else { continue }
                let srcRange = match.range(at: 1)
                guard srcRange.location != NSNotFound else { continue }
                let src = nsStripped.substring(with: srcRange)
                if isLocalRelativeSrc(src) { srcs.insert(src) }
            }
        }
        return Array(srcs)
    }

    func isLocalRelativeSrc(_ src: String) -> Bool {
        guard !src.isEmpty else { return false }
        let lower = src.lowercased()
        return !lower.hasPrefix("http://") &&
               !lower.hasPrefix("https://") &&
               !lower.hasPrefix("data:") &&
               !lower.hasPrefix("//") &&
               !lower.hasPrefix("/")
    }

    // MARK: - Security-scoped bookmarks

    /// Stores a security-scoped bookmark for the parent directory in UserDefaults, keyed by the
    /// directory path. Must be called while the granting NSOpenPanel is on the call stack.
    ///
    /// Pass `dirURL` for .md files: UTI public.plain-text does NOT receive the implicit
    /// parent-directory powerbox grant that web-content UTIs (public.html, com.apple.package) get
    /// from NSOpenPanel, so a second panel must explicitly grant directory access and its URL is
    /// passed here. When `dirURL` is nil the parent is derived from `fileURL`, which works for
    /// .html and .htmd because their powerbox grant already extends to the parent directory.
    ///
    /// Silently does nothing if a bookmark cannot be created.
    func storeParentDirBookmark(for fileURL: URL, using dirURL: URL? = nil) {
        let parentDir = dirURL ?? fileURL.deletingLastPathComponent()
        if let data = try? parentDir.bookmarkData(
            options: .withSecurityScope,
            includingResourceValuesForKeys: nil,
            relativeTo: nil
        ) {
            UserDefaults.standard.set(data, forKey: "parentDirBookmark:\(parentDir.path(percentEncoded: false))")
        }
    }

    /// Resolves a previously stored security-scoped bookmark for the parent directory of `fileURL`.
    /// Returns the scoped URL ready for `startAccessingSecurityScopedResource()`, or nil if none stored.
    func resolveParentDirBookmark(for fileURL: URL) -> URL? {
        let parentDir = fileURL.deletingLastPathComponent()
        guard let data = UserDefaults.standard.data(forKey: "parentDirBookmark:\(parentDir.path(percentEncoded: false))") else { return nil }
        var isStale = false
        return try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &isStale)
    }

    // MARK: - HTML preamble

    /// Extracts the HTML preamble code block from the start of editor HTML, if present.
    /// The editor represents an HTML preamble as `<pre><code>…</code></pre>` at position 0.
    /// Returns the raw unescaped preamble HTML and the remaining body HTML, or (nil, html) when absent.
    func extractHTMLPreamble(from html: String) -> (preamble: String?, body: String) {
        let trimmed = html.trimmingCharacters(in: .whitespacesAndNewlines)
        let openTag = "<pre><code>"
        let closeTag = "</code></pre>"
        guard trimmed.hasPrefix(openTag) else { return (nil, html) }
        guard let closeRange = trimmed.range(of: closeTag) else { return (nil, html) }
        let contentStart = trimmed.index(trimmed.startIndex, offsetBy: openTag.count)
        let escaped = String(trimmed[contentStart..<closeRange.lowerBound])
        let preamble = unescapeHTMLEntities(escaped)
        let afterBlock = String(trimmed[closeRange.upperBound...]).trimmingCharacters(in: .whitespacesAndNewlines)
        return (preamble, afterBlock)
    }

    private func unescapeHTMLEntities(_ s: String) -> String {
        // Order matters: &amp; must be last to avoid double-unescaping &amp;lt; → &lt; → <
        s.replacingOccurrences(of: "&lt;",   with: "<")
         .replacingOccurrences(of: "&gt;",   with: ">")
         .replacingOccurrences(of: "&quot;", with: "\"")
         .replacingOccurrences(of: "&#39;",  with: "'")
         .replacingOccurrences(of: "&apos;", with: "'")
         .replacingOccurrences(of: "&amp;",  with: "&")
    }

    // MARK: - Metadata

    // TODO: why
    func injectYAMLFrontMatter(into output: String) -> String {
        guard !metadata.isEmpty else { return output }
        let yaml = YAMLMetadata.serialize(metadata)
        return "---\n\(yaml)---\n\n\(output)"
    }

    /// Reads the `.data` JSON metadata file from an htmd package, if present.
    /// Returns an empty array when the file is absent or unreadable.
    func loadHtmdMetadata(from packageURL: URL, htmlFilename: String) -> [MetadataTuple] {
        let dataFilename = (htmlFilename as NSString).deletingPathExtension + ".data"
        let dataURL = packageURL.appendingPathComponent(dataFilename)
        guard FileManager.default.fileExists(atPath: dataURL.path(percentEncoded: false)),
              let data = try? Data(contentsOf: dataURL),
              let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return json.compactMap { obj in
            guard let key = obj["key"] as? String else { return nil }
            if let scalar = obj["value"] as? String {
                return MetadataTuple(key: key, value: .scalar(scalar))
            } else if let array = obj["value"] as? [String] {
                return MetadataTuple(key: key, value: .array(array))
            }
            return nil
        }
    }

    /// Writes metadata as a JSON `.data` file into an htmd package.
    /// Deletes any existing `.data` file when metadata is empty.
    /// Throws on write failure or on deletion failure for a non-empty-to-empty transition.
    func saveHtmdMetadata(_ metadata: [MetadataTuple], to packageURL: URL) throws {
        let dataFilename = (rootFilename() as NSString).deletingPathExtension + ".data"
        let dataURL = packageURL.appendingPathComponent(dataFilename)
        guard !metadata.isEmpty else {
            if FileManager.default.fileExists(atPath: dataURL.path(percentEncoded: false)) {
                try FileManager.default.removeItem(at: dataURL)
            }
            return
        }
        let json: [[String: Any]] = metadata.map { entry in
            switch entry.value {
            case .scalar(let s): return ["key": entry.key, "value": s]
            case .array(let elements): return ["key": entry.key, "value": elements]
            }
        }
        let data = try JSONSerialization.data(withJSONObject: json, options: [.prettyPrinted])
        try data.write(to: dataURL, options: .atomic)
    }
}
