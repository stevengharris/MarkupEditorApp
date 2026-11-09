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
        let taken = Set(existing.map { $0.lowercased() })
        guard taken.contains(base) else { return base }
        var n = 2
        while taken.contains("\(base)-\(n)") { n += 1 }
        return "\(base)-\(n)"
    }

    /// The image file types a template folder may hold.
    static let imageExtensions: Set<String> = ["png", "jpg", "jpeg", "gif", "svg", "webp", "tif", "tiff", "heic", "bmp"]

    /// The rules a folder broke, each stated once with how many times it was broken and one example, so the
    /// message stays short however many files are wrong.
    private struct Violations {
        private var order: [String] = []
        private var found: [String: (count: Int, example: String)] = [:]

        var isEmpty: Bool { order.isEmpty }

        mutating func add(_ rule: String, example: String) {
            if let existing = found[rule] {
                found[rule] = (existing.count + 1, existing.example)
            } else {
                order.append(rule)
                found[rule] = (1, example)
            }
        }

        var messages: [String] {
            order.compactMap { rule in
                guard let entry = found[rule] else { return nil }
                return entry.count == 1 ? "\(rule) (\(entry.example))" : "\(rule) (\(entry.count) found, for example \(entry.example))"
            }
        }
    }

    private static let notAnImage = "Besides the Markdown file and manifest.json, only image files are allowed."
    private static let noLinks = "Links are not allowed."
    private static let oneSubfolder = "At most one subfolder is allowed, for images."
    private static let subfolderImagesOnly = "The image subfolder may hold only image files."

    /// Checks that `folder` can become a template: one Markdown file; at most one manifest.json; and
    /// otherwise only image files and/or one subfolder holding only image files. Hidden files are ignored.
    /// Throws `invalidFolder` naming each rule that was broken.
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

        var violations = Violations()
        var markdownFiles = 0
        var subfolders: [URL] = []
        for entry in entries(folder) {
            let name = entry.lastPathComponent
            if isLink(entry) {
                violations.add(noLinks, example: name)
            } else if isDirectory(entry) {
                if name == UserLibraryItem.manifestName {
                    violations.add("manifest.json must be a file, not a folder.", example: name)
                } else {
                    subfolders.append(entry)
                }
            } else if entry.pathExtension.lowercased() == "md" {
                markdownFiles += 1
            } else if name != UserLibraryItem.manifestName, !isImage(entry) {
                violations.add(notAnImage, example: name)
            }
        }
        var messages: [String] = []
        if markdownFiles != 1 {
            messages.append("The folder must hold exactly one Markdown file; it holds \(markdownFiles).")
        }
        for extra in subfolders.dropFirst() { violations.add(oneSubfolder, example: extra.lastPathComponent) }
        for subfolder in subfolders {
            for entry in entries(subfolder) {
                let name = "\(subfolder.lastPathComponent)/\(entry.lastPathComponent)"
                if isLink(entry) {
                    violations.add(noLinks, example: name)
                } else if isDirectory(entry) || !isImage(entry) {
                    violations.add(subfolderImagesOnly, example: name)
                }
            }
        }
        messages += violations.messages
        if !messages.isEmpty { throw LibraryError.invalidFolder(messages) }
    }

    /// Checks the image paths a document refers to against the same rules as `validate(folder:)`: image files
    /// only, at the top level and/or in one subfolder, nothing deeper, and nothing outside the document's
    /// folder. A path is a URL reference, so it is percent-decoded first. Throws `invalidFolder` naming each
    /// rule that was broken.
    public static func validate(assets: [String]) throws {
        var violations = Violations()
        var subfolders: Set<String> = []
        for encoded in assets {
            let asset = encoded.removingPercentEncoding ?? encoded
            let parts = asset.split(separator: "/", omittingEmptySubsequences: false).map(String.init)
            if asset.hasPrefix("/") || parts.contains("..") || parts.contains(".") || parts.contains("") {
                violations.add("Images must be inside the document's folder.", example: asset)
                continue
            }
            if !imageExtensions.contains((asset as NSString).pathExtension.lowercased()) {
                violations.add("Only image files are allowed.", example: asset)
            }
            if parts.count > 2 {
                violations.add("Images may be at the top or in one subfolder, not nested deeper.", example: asset)
            } else if parts.count == 2 {
                subfolders.insert(parts[0])
            }
        }
        if subfolders.count > 1 {
            violations.add("Images may be in only one subfolder.", example: subfolders.sorted().joined(separator: ", "))
        }
        if !violations.isEmpty { throw LibraryError.invalidFolder(violations.messages) }
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
        if isDirectory {
            try Self.validate(folder: source)
        } else if (try? source.resourceValues(forKeys: [.isSymbolicLinkKey]))?.isSymbolicLink == true {
            throw LibraryError.invalidFolder(["\(Self.noLinks) (\(source.lastPathComponent))"])
        }
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
                var asset = encoded.removingPercentEncoding ?? encoded
                if asset != encoded, !fm.fileExists(atPath: assetsRoot.appendingPathComponent(asset).path) { asset = encoded }
                let source = assetsRoot.appendingPathComponent(asset)
                let target = destination.appendingPathComponent(asset)
                guard !asset.hasPrefix("/"),
                      PathContainment.isInside(source, of: assetsRoot),
                      PathContainment.isInside(target, of: destination),
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
        let existing = Set(((try? fm.contentsOfDirectory(atPath: directory.path)) ?? []).map { $0.lowercased() })
        let destination = directory.appendingPathComponent(Self.folderName(for: trimmed, avoiding: existing))
        var created = false
        do {
            try fm.createDirectory(at: destination, withIntermediateDirectories: false)
            created = true
            try populate(destination)
            let manifest = LibraryManifest(name: trimmed, description: description)
            try Self.encoder.encode(manifest).write(to: destination.appendingPathComponent(UserLibraryItem.manifestName))
            let item = UserLibraryItem(url: destination, manifest: manifest)
            _ = try item.documentURL()
            return item
        } catch {
            // Remove only a folder this call made, never one that was already there.
            if created { try? fm.removeItem(at: destination) }
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
