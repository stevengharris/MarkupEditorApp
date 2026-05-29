//
//  DocumentOpener.swift
//  MarkupEditorApp

import Foundation
import MarkupEditor

// MARK: - Local image query

protocol LocalImagesProvider {
    func getLocalImages(handler: (([String]) -> Void)?)
}

extension MarkupWKWebView: LocalImagesProvider {}

/// Calls `getLocalImages` on `provider` and delivers the result to `completion`.
/// Delivers an empty array if `provider` is nil (no webview loaded).
func fetchLocalImageSrcs(from provider: (any LocalImagesProvider)?, completion: @escaping ([String]) -> Void) {
    guard let provider else {
        completion([])
        return
    }
    provider.getLocalImages(handler: completion)
}

// MARK: - Save sync

/// Syncs image assets from `baseUrl` into `docDir`.
/// Copies each src that is missing from `docDir`; skips srcs absent from `baseUrl`.
/// When `deleteOrphans` is true, removes non-HTML files in `docDir` whose relative path
/// is not present in `srcs` (used for .htmd saves to remove deleted images).
func syncImageAssets(srcs: [String], baseUrl: URL, docDir: URL, deleteOrphans: Bool) throws {
    let fm = FileManager.default
    let srcSet = Set(srcs)
    for src in srcs {
        let dest = docDir.appendingPathComponent(src)
        guard !fm.fileExists(atPath: dest.path) else { continue }
        let source = baseUrl.appendingPathComponent(src)
        guard fm.fileExists(atPath: source.path) else { continue }
        let parent = dest.deletingLastPathComponent()
        if !fm.fileExists(atPath: parent.path) {
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
    var docDirPath = docDir.path
    if docDirPath.hasSuffix("/") { docDirPath.removeLast() }
    for case let fileURL as URL in enumerator {
        let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey])
        guard values.isRegularFile == true else { continue }
        let ext = fileURL.pathExtension.lowercased()
        guard ext != "html" else { continue }
        // Preserve spec-defined non-image package files regardless of image-srcs list.
        let preservedExtensions: Set<String> = ["data", "css", "htmd"]
        guard !preservedExtensions.contains(ext) else { continue }
        let relativePath = String(fileURL.path.dropFirst(docDirPath.count + 1))
        if !srcSet.contains(relativePath) {
            try fm.removeItem(at: fileURL)
        }
    }
}

// MARK: - Save As

/// Creates a fresh .htmd package at `packageURL`, writes `html` to index.html,
/// and copies each src from `baseUrl` into the package preserving relative paths.
/// If a package already exists at `packageURL` it is replaced.
func saveAsHtmd(srcs: [String], html: String, baseUrl: URL, to packageURL: URL) throws {
    let fm = FileManager.default
    if fm.fileExists(atPath: packageURL.path) {
        try fm.removeItem(at: packageURL)
    }
    try fm.createDirectory(at: packageURL, withIntermediateDirectories: true)
    try html.write(to: packageURL.appendingPathComponent("index.html"), atomically: true, encoding: .utf8)
    try copyImageAssets(srcs: srcs, from: baseUrl, to: packageURL, skipMissing: true)
}

/// Writes `html` to `fileURL` and copies each src from `baseUrl` alongside the file,
/// preserving relative paths. Does not delete any existing files.
func saveAsHtml(srcs: [String], html: String, baseUrl: URL, to fileURL: URL) throws {
    try html.write(to: fileURL, atomically: true, encoding: .utf8)
    let parentDir = fileURL.deletingLastPathComponent()
    try copyImageAssets(srcs: srcs, from: baseUrl, to: parentDir, skipMissing: true)
}

// MARK: - Plugin lookup

/// Returns the JS registry key (`name`) for the first plugin whose `fileExtension`
/// matches `ext`, or `nil` if no matching plugin is configured.
///
/// - Parameters:
///   - ext: The file extension to look up (e.g. `"md"`). Case-sensitive; callers
///     are expected to lowercase the extension before calling.
///   - config: The `AppConfig` to search. Defaults to `AppConfig.fromDefaults()`.
func pluginId(forExtension ext: String, in config: AppConfig = AppConfig.fromDefaults()) -> String? {
    config.plugins?.first(where: { $0.fileExtension == ext })?.name
}

/// Decoded envelope returned by every `invokePlugin` call.
/// The JS plugin wraps its output as `{ "result": string|null, "warnings": [string] }`.
struct PluginResult: Decodable {
    let result: String?
    let warnings: [String]
    let metadata: String?

    static func decode(from jsonString: String?) -> PluginResult? {
        guard let data = jsonString?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(PluginResult.self, from: data)
    }
}

// MARK: - Types

enum DocumentType: Equatable { case html, htmd, md }

enum DocumentOpenError: Error, Equatable {
    case invalidExtension
    case rootHtmlNotFound
    case ambiguousRootHtml(Int)
    case missingPackageImage(String)
    case noWebviewAvailable
}

/// Returns the single .html file at the root of `packageURL`, or throws if there are zero or more than one.
func findRootHTML(in packageURL: URL) throws -> URL {
    let contents = try FileManager.default.contentsOfDirectory(
        at: packageURL,
        includingPropertiesForKeys: nil,
        options: .skipsHiddenFiles
    )
    let htmlFiles = contents.filter { $0.pathExtension.lowercased() == "html" }
    guard !htmlFiles.isEmpty else { throw DocumentOpenError.rootHtmlNotFound }
    guard htmlFiles.count == 1 else { throw DocumentOpenError.ambiguousRootHtml(htmlFiles.count) }
    return htmlFiles[0]
}

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

func isLocalRelativeSrc(_ src: String) -> Bool {
    guard !src.isEmpty else { return false }
    let lower = src.lowercased()
    return !lower.hasPrefix("http://") &&
           !lower.hasPrefix("https://") &&
           !lower.hasPrefix("data:") &&
           !lower.hasPrefix("//") &&
           !lower.hasPrefix("/")
}

/// Copies `sourceDir/<src>` to `destDir/<src>` for each src, creating subdirectories as needed.
/// When `skipMissing` is true, files absent from sourceDir are silently ignored.
/// When false, a missing file throws `DocumentOpenError.missingPackageImage`.
func copyImageAssets(srcs: [String], from sourceDir: URL, to destDir: URL, skipMissing: Bool) throws {
    let fm = FileManager.default
    for src in srcs {
        let source = sourceDir.appendingPathComponent(src)
        let dest = destDir.appendingPathComponent(src)
        guard fm.fileExists(atPath: source.path) else {
            if skipMissing { continue }
            throw DocumentOpenError.missingPackageImage(src)
        }
        let parent = dest.deletingLastPathComponent()
        if !fm.fileExists(atPath: parent.path) {
            try fm.createDirectory(at: parent, withIntermediateDirectories: true)
        }
        if fm.fileExists(atPath: dest.path) {
            try fm.removeItem(at: dest)
        }
        try fm.copyItem(at: source, to: dest)
    }
}

/// Stores a security-scoped bookmark for the parent directory of `fileURL` in UserDefaults.
/// Must be called while the sandbox already has access to that directory (e.g. via NSOpenPanel).
/// Silently does nothing if a bookmark cannot be created.
func storeParentDirBookmark(for fileURL: URL) {
    let parentDir = fileURL.deletingLastPathComponent()
    guard let data = try? parentDir.bookmarkData(
        options: .withSecurityScope,
        includingResourceValuesForKeys: nil,
        relativeTo: nil
    ) else { return }
    UserDefaults.standard.set(data, forKey: "parentDirBookmark:\(fileURL.path)")
}

/// Resolves a previously stored security-scoped bookmark for the parent directory of `fileURL`.
/// Returns the scoped URL ready for `startAccessingSecurityScopedResource()`, or nil if none stored.
func resolveParentDirBookmark(for fileURL: URL) -> URL? {
    guard let data = UserDefaults.standard.data(forKey: "parentDirBookmark:\(fileURL.path)") else { return nil }
    var isStale = false
    return try? URL(resolvingBookmarkData: data, options: .withSecurityScope, relativeTo: nil, bookmarkDataIsStale: &isStale)
}

/// Copies all non-HTML files from `packageURL` to `destDir`, preserving relative paths.
/// Returns the set of relative path strings that were copied.
/// Extract the HTML preamble code block from the start of editor HTML, if present.
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

/// Reads the `.data` JSON metadata file from an htmd package, if present.
/// Returns an empty array when the file is absent or unreadable.
func loadHtmdMetadata(from packageURL: URL) -> [(key: String, value: MetadataValue)] {
    let dataURL = packageURL.appendingPathComponent(".data")
    guard FileManager.default.fileExists(atPath: dataURL.path),
          let data = try? Data(contentsOf: dataURL),
          let json = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
    else { return [] }
    return json.compactMap { obj in
        guard let key = obj["key"] as? String else { return nil }
        if let scalar = obj["value"] as? String {
            return (key: key, value: .scalar(scalar))
        } else if let array = obj["value"] as? [String] {
            return (key: key, value: .array(array))
        }
        return nil
    }
}

/// Writes metadata as a JSON `.data` file into an htmd package.
/// Deletes any existing `.data` file when metadata is empty.
/// Throws on write failure or on deletion failure for a non-empty-to-empty transition.
func saveHtmdMetadata(_ metadata: [(key: String, value: MetadataValue)], to packageURL: URL) throws {
    let dataURL = packageURL.appendingPathComponent(".data")
    guard !metadata.isEmpty else {
        if FileManager.default.fileExists(atPath: dataURL.path) {
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
    try data.write(to: dataURL)
}

func copyPackageAssets(from packageURL: URL, to destDir: URL) throws -> Set<String> {
    let fm = FileManager.default
    guard let enumerator = fm.enumerator(
        at: packageURL,
        includingPropertiesForKeys: [.isRegularFileKey],
        options: [.skipsHiddenFiles]
    ) else { return [] }
    var pkgPath = packageURL.path
    if pkgPath.hasSuffix("/") { pkgPath.removeLast() }
    var copied = Set<String>()
    for case let fileURL as URL in enumerator {
        let values = try fileURL.resourceValues(forKeys: [.isRegularFileKey])
        guard values.isRegularFile == true else { continue }
        guard fileURL.pathExtension.lowercased() != "html" else { continue }
        let relativePath = String(fileURL.path.dropFirst(pkgPath.count + 1))
        let dest = destDir.appendingPathComponent(relativePath)
        let parent = dest.deletingLastPathComponent()
        if !fm.fileExists(atPath: parent.path) {
            try fm.createDirectory(at: parent, withIntermediateDirectories: true)
        }
        if fm.fileExists(atPath: dest.path) {
            try fm.removeItem(at: dest)
        }
        try fm.copyItem(at: fileURL, to: dest)
        copied.insert(relativePath)
    }
    return copied
}
