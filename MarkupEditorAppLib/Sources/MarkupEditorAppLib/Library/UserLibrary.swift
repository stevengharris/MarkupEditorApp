//
//  UserLibrary.swift
//  MarkupEditorAppLib
//

import Foundation
import OSLog

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorAppLib", category: "UserLibrary")

/// A kind of user content kept in a folder under Application Support, with one subfolder per item.
/// Templates are the first kind.
public struct UserLibrary: Sendable {
    public let directory: URL

    public init(directory: URL) {
        self.directory = directory
    }

    public static var templates: UserLibrary {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return UserLibrary(directory: support.appendingPathComponent("templates"))
    }

    /// The items with a readable manifest, sorted by name. A folder without one is skipped.
    public func items() -> [UserLibraryItem] {
        let folders = (try? FileManager.default.contentsOfDirectory(
            at: directory, includingPropertiesForKeys: [.isDirectoryKey], options: [.skipsHiddenFiles])) ?? []
        var items: [UserLibraryItem] = []
        for folder in folders where (try? folder.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true {
            let manifestURL = folder.appendingPathComponent(UserLibraryItem.manifestName)
            do {
                let manifest = try JSONDecoder().decode(LibraryManifest.self, from: Data(contentsOf: manifestURL))
                let item = UserLibraryItem(url: folder, manifest: manifest)
                _ = try item.documentURL()
                items.append(item)
            } catch {
                logger.warning("Skipping \(folder.lastPathComponent): \(error.localizedDescription)")
            }
        }
        return items.sorted { $0.manifest.name.localizedStandardCompare($1.manifest.name) == .orderedAscending }
    }

    /// The folder name for an item called `name`: lowercase letters, digits and hyphens, made unique
    /// among `existing` with a numeric suffix.
    public static func folderName(for name: String, avoiding existing: Set<String>) -> String {
        let slug = name.lowercased()
            .map { $0.isASCII && ($0.isLetter || $0.isNumber) ? String($0) : "-" }.joined()
            .split(separator: "-", omittingEmptySubsequences: true).joined(separator: "-")
        let base = slug.isEmpty ? "template" : slug
        guard existing.contains(base) else { return base }
        var n = 2
        while existing.contains("\(base)-\(n)") { n += 1 }
        return "\(base)-\(n)"
    }

    /// The image file types a template folder may hold.
    static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "svg", "webp", "tif", "tiff", "heic", "bmp"]

    /// Checks that `folder` can become a template: one Markdown file; at most one manifest.json; and
    /// otherwise only image files and/or one subfolder holding only image files. Hidden files are ignored.
    /// Throws `invalidFolder` listing every problem found.
    public static func validate(folder: URL) throws {
        let fm = FileManager.default
        let keys: [URLResourceKey] = [.isDirectoryKey, .isSymbolicLinkKey]
        func entries(_ url: URL) -> [URL] {
            ((try? fm.contentsOfDirectory(at: url, includingPropertiesForKeys: keys, options: [.skipsHiddenFiles])) ?? [])
                .sorted { $0.lastPathComponent < $1.lastPathComponent }
        }
        func isDirectory(_ url: URL) -> Bool { (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true }
        func isLink(_ url: URL) -> Bool { (try? url.resourceValues(forKeys: [.isSymbolicLinkKey]))?.isSymbolicLink == true }
        func isImage(_ url: URL) -> Bool { imageExtensions.contains(url.pathExtension.lowercased()) }

        var problems: [String] = []
        var markdownFiles = 0
        var subfolders: [URL] = []
        for entry in entries(folder) {
            let name = entry.lastPathComponent
            if isLink(entry) {
                problems.append("\(name) is a link, which is not allowed.")
            } else if isDirectory(entry) {
                if name == UserLibraryItem.manifestName { problems.append("\(name) is a folder.") } else { subfolders.append(entry) }
            } else if entry.pathExtension.lowercased() == "md" {
                markdownFiles += 1
            } else if name != UserLibraryItem.manifestName, !isImage(entry) {
                problems.append("\(name) is neither Markdown, a manifest nor an image.")
            }
        }
        if markdownFiles != 1 {
            problems.insert("The folder must hold exactly one Markdown file; it holds \(markdownFiles).", at: 0)
        }
        if subfolders.count > 1 {
            problems.append("The folder may hold only one subfolder, for images; it holds \(subfolders.count).")
        }
        for subfolder in subfolders {
            for entry in entries(subfolder) {
                let name = "\(subfolder.lastPathComponent)/\(entry.lastPathComponent)"
                if isLink(entry) {
                    problems.append("\(name) is a link, which is not allowed.")
                } else if isDirectory(entry) {
                    problems.append("\(name) is a folder; the image subfolder cannot hold folders.")
                } else if !isImage(entry) {
                    problems.append("\(name) is not an image.")
                }
            }
        }
        if !problems.isEmpty { throw LibraryError.invalidFolder(problems) }
    }

    /// Checks the image paths a document refers to against the same rules as `validate(folder:)`: image files
    /// only, at the top level and/or in one subfolder, nothing deeper, and nothing outside the document's
    /// folder. A path is a URL reference, so it is percent-decoded first. Throws `invalidFolder`.
    public static func validate(assets: [String]) throws {
        var problems: [String] = []
        var subfolders: Set<String> = []
        for encoded in assets {
            let asset = encoded.removingPercentEncoding ?? encoded
            let parts = asset.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
            if asset.hasPrefix("/") || parts.contains("..") || parts.contains(".") || parts.contains("") {
                problems.append("\(asset) is not inside the document's folder.")
                continue
            }
            if !imageExtensions.contains((asset as NSString).pathExtension.lowercased()) {
                problems.append("\(asset) is not an image.")
            }
            if parts.count > 2 {
                problems.append("\(asset) is nested more than one folder deep; images may be at the top or in one subfolder.")
            } else if parts.count == 2 {
                subfolders.insert(parts[0])
            }
        }
        if subfolders.count > 1 {
            problems.append("Images are in \(subfolders.count) subfolders (\(subfolders.sorted().joined(separator: ", "))); only one is allowed.")
        }
        if !problems.isEmpty { throw LibraryError.invalidFolder(problems) }
    }

    /// Adds an item made from `source`, a Markdown file or a folder that passes `validate`. The item's
    /// manifest is written from `name` and `description`, replacing a manifest the folder already had.
    /// Nothing is left behind when it fails.
    @discardableResult
    public func add(from source: URL, name: String, description: String) throws -> UserLibraryItem {
        let isDirectory = (try? source.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true
        guard isDirectory || source.pathExtension.lowercased() == "md" else {
            throw LibraryError.unsupportedSource(source.lastPathComponent)
        }
        if isDirectory { try Self.validate(folder: source) }
        return try create(name: name, description: description) { destination in
            let fm = FileManager.default
            guard isDirectory else {
                try fm.copyItem(at: source, to: destination.appendingPathComponent(source.lastPathComponent))
                return
            }
            for entry in try fm.contentsOfDirectory(at: source, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles])
            where entry.lastPathComponent != UserLibraryItem.manifestName {
                let target = destination.appendingPathComponent(entry.lastPathComponent)
                if (try? entry.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true {
                    try fm.createDirectory(at: target, withIntermediateDirectories: false)
                    for image in try fm.contentsOfDirectory(at: entry, includingPropertiesForKeys: nil, options: [.skipsHiddenFiles]) {
                        try fm.copyItem(at: image, to: target.appendingPathComponent(image.lastPathComponent))
                    }
                } else {
                    try fm.copyItem(at: entry, to: target)
                }
            }
        }
    }

    /// Adds an item whose document is `markdown`. `assets` are the relative paths of the images it refers to,
    /// copied from `assetsRoot`; they must pass `validate(assets:)`. A path whose file is missing is skipped.
    @discardableResult
    public func add(markdown: String, name: String, description: String, assets: [String], from assetsRoot: URL) throws -> UserLibraryItem {
        try Self.validate(assets: assets)
        return try create(name: name, description: description) { destination in
            let fm = FileManager.default
            let slug = destination.lastPathComponent
            try markdown.write(to: destination.appendingPathComponent("\(slug).md"), atomically: true, encoding: .utf8)
            for encoded in assets {
                let asset = encoded.removingPercentEncoding ?? encoded
                let source = assetsRoot.appendingPathComponent(asset).standardizedFileURL
                let target = destination.appendingPathComponent(asset).standardizedFileURL
                guard !asset.hasPrefix("/"),
                      source.path.hasPrefix(assetsRoot.standardizedFileURL.path + "/"),
                      target.path.hasPrefix(destination.standardizedFileURL.path + "/"),
                      fm.fileExists(atPath: source.path) else { continue }
                try fm.createDirectory(at: target.deletingLastPathComponent(), withIntermediateDirectories: true)
                if !fm.fileExists(atPath: target.path) { try fm.copyItem(at: source, to: target) }
            }
        }
    }

    /// Makes a new item folder with a unique name, lets `populate` fill it, then writes the manifest and checks
    /// the item has a document. The folder is removed when anything fails.
    private func create(name: String, description: String, populate: (URL) throws -> Void) throws -> UserLibraryItem {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw LibraryError.emptyName }
        let fm = FileManager.default
        try fm.createDirectory(at: directory, withIntermediateDirectories: true)
        let existing = Set((try? fm.contentsOfDirectory(atPath: directory.path)) ?? [])
        let destination = directory.appendingPathComponent(Self.folderName(for: trimmed, avoiding: existing))
        do {
            try fm.createDirectory(at: destination, withIntermediateDirectories: false)
            try populate(destination)
            let manifest = LibraryManifest(name: trimmed, description: description)
            try Self.encoder.encode(manifest).write(to: destination.appendingPathComponent(UserLibraryItem.manifestName))
            let item = UserLibraryItem(url: destination, manifest: manifest)
            _ = try item.documentURL()
            return item
        } catch {
            try? fm.removeItem(at: destination)
            throw error
        }
    }

    /// Rewrites `item`'s manifest with a new name and description, keeping its folder and its document.
    /// Refuses an empty name and anything that is not directly inside the library.
    @discardableResult
    public func update(_ item: UserLibraryItem, name: String, description: String) throws -> UserLibraryItem {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { throw LibraryError.emptyName }
        guard item.url.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL else {
            throw LibraryError.notInLibrary
        }
        var manifest = item.manifest
        manifest.name = trimmed
        manifest.description = description.trimmingCharacters(in: .whitespacesAndNewlines)
        try Self.encoder.encode(manifest).write(to: item.url.appendingPathComponent(UserLibraryItem.manifestName), options: .atomic)
        return UserLibraryItem(url: item.url, manifest: manifest)
    }

    /// Removes `item`'s folder. Refuses anything that is not directly inside the library.
    public func delete(_ item: UserLibraryItem) throws {
        guard item.url.deletingLastPathComponent().standardizedFileURL == directory.standardizedFileURL else {
            throw LibraryError.notInLibrary
        }
        try FileManager.default.removeItem(at: item.url)
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    /// One line of the index that lists the built-in items. Bundled resources are flattened into one
    /// folder, so the index names each item's folder and the bundled file that holds its document.
    public struct BuiltInEntry: Codable, Sendable, Equatable {
        public let folder: String
        public let name: String
        public let description: String
        public let file: String
    }

    /// The built-ins an index describes. `data(forFile:)` returns the bytes of a bundled file, or nil when
    /// it is missing; an entry whose file is missing is left out.
    public static func builtIns(index: Data, data: (String) -> Data?) throws -> [BuiltIn] {
        try JSONDecoder().decode([BuiltInEntry].self, from: index).compactMap { entry in
            guard let document = data(entry.file) else {
                logger.warning("Built-in \(entry.folder) is missing its file \(entry.file)")
                return nil
            }
            return BuiltIn(
                folder: entry.folder,
                manifest: LibraryManifest(name: entry.name, description: entry.description),
                files: [entry.file: document])
        }
    }

    /// A folder the app ships: its name and the files in it. The manifest is written from `manifest`.
    public struct BuiltIn: Sendable {
        public let folder: String
        public let manifest: LibraryManifest
        public let files: [String: Data]

        public init(folder: String, manifest: LibraryManifest, files: [String: Data]) {
            self.folder = folder
            self.manifest = manifest
            self.files = files
        }
    }

    /// Writes each built-in as an item folder unless its name is in `seeded` or a folder of that name
    /// already exists. Returns the names it wrote, so the caller can add them to `seeded`; an item the
    /// user deletes is then not put back.
    @discardableResult
    public func seed(_ builtIns: [BuiltIn], skipping seeded: Set<String>) -> [String] {
        let fm = FileManager.default
        var written: [String] = []
        for builtIn in builtIns {
            let destination = directory.appendingPathComponent(builtIn.folder)
            guard !seeded.contains(builtIn.folder), !fm.fileExists(atPath: destination.path) else { continue }
            do {
                try fm.createDirectory(at: destination, withIntermediateDirectories: true)
                let encoder = JSONEncoder()
                encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
                try encoder.encode(builtIn.manifest).write(to: destination.appendingPathComponent(UserLibraryItem.manifestName))
                for (name, data) in builtIn.files {
                    try data.write(to: destination.appendingPathComponent(name))
                }
                written.append(builtIn.folder)
            } catch {
                logger.error("Could not seed \(builtIn.folder): \(error.localizedDescription)")
                try? fm.removeItem(at: destination)
            }
        }
        return written
    }
}
