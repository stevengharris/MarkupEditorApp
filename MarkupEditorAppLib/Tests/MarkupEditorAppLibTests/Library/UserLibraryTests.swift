//
//  UserLibraryTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct UserLibraryTests {

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("UserLibraryTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @discardableResult
    private func makeItem(in root: URL, folder: String, name: String?, files: [String: String] = [:], document: String? = nil) throws -> URL {
        let dir = root.appendingPathComponent(folder)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        if let name {
            let manifest = LibraryManifest(name: name, description: "About \(name)", document: document)
            try JSONEncoder().encode(manifest).write(to: dir.appendingPathComponent(UserLibraryItem.manifestName))
        }
        for (file, text) in files { try text.write(to: dir.appendingPathComponent(file), atomically: true, encoding: .utf8) }
        return dir
    }

    @Test func itemsAreSortedByNameAndFoldersWithoutAManifestAreSkipped() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        try makeItem(in: root, folder: "b", name: "Beta", files: ["b.md": "b"])
        try makeItem(in: root, folder: "a", name: "Alpha", files: ["a.md": "a"])
        try makeItem(in: root, folder: "c", name: nil, files: ["c.md": "c"])
        let items = UserLibrary(directory: root).items()
        #expect(items.map(\.manifest.name) == ["Alpha", "Beta"])
        #expect(items.map(\.id) == ["a", "b"])
    }

    @Test func aMalformedManifestIsSkipped() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let dir = try makeItem(in: root, folder: "bad", name: nil)
        try "{ not json".write(to: dir.appendingPathComponent(UserLibraryItem.manifestName), atomically: true, encoding: .utf8)
        #expect(UserLibrary(directory: root).items().isEmpty)
    }

    @Test func manifestIgnoresUnknownFieldsAndMakesDocumentOptional() throws {
        let json = #"{"name": "N", "description": "D", "kind": "template"}"#
        let manifest = try JSONDecoder().decode(LibraryManifest.self, from: Data(json.utf8))
        #expect(manifest == LibraryManifest(name: "N", description: "D"))
    }

    @Test func theDocumentIsTheOnlyMarkdownFileUnlessTheManifestNamesOne() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        func item(_ folder: String, _ name: String, files: [String: String], document: String? = nil) throws -> UserLibraryItem {
            UserLibraryItem(url: try makeItem(in: root, folder: folder, name: nil, files: files), manifest: LibraryManifest(name: name, description: "", document: document))
        }
        #expect(try item("one", "One", files: ["x.md": "x", "pic.png": "p"]).documentURL().lastPathComponent == "x.md")
        #expect(try item("named", "Named", files: ["a.md": "a", "b.md": "b"], document: "b.md").documentURL().lastPathComponent == "b.md")
        #expect(throws: LibraryError.ambiguousDocument("Two")) { try item("two", "Two", files: ["a.md": "a", "b.md": "b"]).documentURL() }
        #expect(throws: LibraryError.noDocument("None")) { try item("none", "None", files: ["pic.png": "p"]).documentURL() }
    }

    private func builtIn(_ folder: String, _ name: String, text: String) -> UserLibrary.BuiltIn {
        UserLibrary.BuiltIn(folder: folder, manifest: LibraryManifest(name: name, description: "About \(name)"), files: ["\(folder).md": Data(text.utf8)])
    }

    @Test func seedingWritesMissingItemsOnceAndNeverOverwritesOrRestores() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let builtIns = [builtIn("first", "First", text: "original"), builtIn("second", "Second", text: "s")]

        #expect(library.seed(builtIns, skipping: []).sorted() == ["first", "second"])
        #expect(library.items().map(\.manifest.name) == ["First", "Second"])
        #expect(try library.items()[0].documentURL().lastPathComponent == "first.md")

        // The user edits one and deletes the other; a later launch with both recorded changes nothing.
        let edited = library.directory.appendingPathComponent("first/first.md")
        try "edited".write(to: edited, atomically: true, encoding: .utf8)
        try FileManager.default.removeItem(at: library.directory.appendingPathComponent("second"))
        #expect(library.seed(builtIns, skipping: ["first", "second"]).isEmpty)
        #expect(try String(contentsOf: edited, encoding: .utf8) == "edited")
        #expect(library.items().map(\.id) == ["first"])

        // An existing folder is not overwritten even when it was not recorded as seeded.
        #expect(library.seed(builtIns, skipping: ["second"]).isEmpty)
        #expect(try String(contentsOf: edited, encoding: .utf8) == "edited")
    }

    @Test func builtInsComeFromTheIndexAndSkipEntriesWithNoFile() throws {
        let index = """
            [{"folder": "a", "name": "A", "description": "About A", "file": "a.md"},
             {"folder": "b", "name": "B", "description": "About B", "file": "b.md"}]
            """
        let builtIns = try UserLibrary.builtIns(index: Data(index.utf8)) { $0 == "a.md" ? Data("alpha".utf8) : nil }
        #expect(builtIns.map(\.folder) == ["a"])
        #expect(builtIns[0].manifest == LibraryManifest(name: "A", description: "About A"))
        #expect(builtIns[0].files["a.md"] == Data("alpha".utf8))
        #expect(throws: (any Error).self) { try UserLibrary.builtIns(index: Data("nope".utf8)) { _ in nil } }
    }

    @Test func folderNamesAreSlugsMadeUnique() {
        #expect(UserLibrary.folderName(for: "Ghost Blog Post!", avoiding: []) == "ghost-blog-post")
        #expect(UserLibrary.folderName(for: "!!!", avoiding: []) == "template")
        #expect(UserLibrary.folderName(for: "Notes", avoiding: ["notes", "notes-2"]) == "notes-3")
    }

    @Test func addingAMarkdownFileMakesAnItemWithTheGivenNameAndDescription() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("My Notes.md")
        try "# Notes".write(to: source, atomically: true, encoding: .utf8)
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let item = try library.add(from: source, name: " Meeting Notes ", description: "For meetings")
        #expect(item.id == "meeting-notes")
        #expect(library.items().map(\.manifest) == [LibraryManifest(name: "Meeting Notes", description: "For meetings")])
        #expect(try item.documentURL().lastPathComponent == "My Notes.md")
    }

    @Test func addingAFolderKeepsItsImagesAndReplacesItsManifest() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = try makeItem(in: root, folder: "src", name: "Old Name", files: ["post.md": "![x](pic.png)", "pic.png": "png"])
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let item = try library.add(from: source, name: "New Name", description: "d")
        #expect(FileManager.default.fileExists(atPath: item.url.appendingPathComponent("pic.png").path))
        #expect(library.items().map(\.manifest.name) == ["New Name"])
        #expect(try item.documentURL().lastPathComponent == "post.md")
    }

    @Test func addingFailsWithoutLeavingAnythingBehind() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let noDocument = try makeItem(in: root, folder: "empty", name: nil, files: ["pic.png": "p"])
        #expect(throws: LibraryError.invalidFolder(["The folder must hold exactly one Markdown file; it holds 0."])) {
            try library.add(from: noDocument, name: "Pics", description: "")
        }
        let text = root.appendingPathComponent("a.txt")
        try "x".write(to: text, atomically: true, encoding: .utf8)
        #expect(throws: LibraryError.unsupportedSource("a.txt")) { try library.add(from: text, name: "A", description: "") }
        let markdown = root.appendingPathComponent("m.md")
        try "m".write(to: markdown, atomically: true, encoding: .utf8)
        #expect(throws: LibraryError.emptyName) { try library.add(from: markdown, name: "  ", description: "") }
        #expect(library.items().isEmpty)
        #expect(((try? FileManager.default.contentsOfDirectory(atPath: library.directory.path)) ?? []).isEmpty)
    }

    @Test func deleteRemovesTheItemAndRefusesFoldersOutsideTheLibrary() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let source = root.appendingPathComponent("a.md")
        try "a".write(to: source, atomically: true, encoding: .utf8)
        let item = try library.add(from: source, name: "A", description: "")
        let outside = UserLibraryItem(url: root, manifest: LibraryManifest(name: "Root", description: ""))
        #expect(throws: LibraryError.notInLibrary) { try library.delete(outside) }
        try library.delete(item)
        #expect(library.items().isEmpty)
        #expect(FileManager.default.fileExists(atPath: root.path))
    }

    @Test func updateRewritesTheManifestAndKeepsTheFolderAndDocument() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let source = root.appendingPathComponent("a.md")
        try "a".write(to: source, atomically: true, encoding: .utf8)
        let item = try library.add(from: source, name: "Old", description: "old text")
        let updated = try library.update(item, name: "  New Name ", description: " new text\n")
        #expect(updated.id == item.id)
        #expect(library.items().map(\.manifest) == [LibraryManifest(name: "New Name", description: "new text")])
        #expect(try updated.documentURL().lastPathComponent == "a.md")
    }

    @Test func updateRefusesAnEmptyNameAndFoldersOutsideTheLibrary() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let source = root.appendingPathComponent("a.md")
        try "a".write(to: source, atomically: true, encoding: .utf8)
        let item = try library.add(from: source, name: "Keep", description: "d")
        #expect(throws: LibraryError.emptyName) { try library.update(item, name: "  ", description: "x") }
        let outside = UserLibraryItem(url: root, manifest: LibraryManifest(name: "Root", description: ""))
        #expect(throws: LibraryError.notInLibrary) { try library.update(outside, name: "X", description: "") }
        #expect(library.items().map(\.manifest.name) == ["Keep"])
    }

    @Test func addingMarkdownWritesTheDocumentAndCopiesItsImages() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = root.appendingPathComponent("cache")
        try FileManager.default.createDirectory(at: cache.appendingPathComponent("img"), withIntermediateDirectories: true)
        try "png".write(to: cache.appendingPathComponent("a.png"), atomically: true, encoding: .utf8)
        try "png2".write(to: cache.appendingPathComponent("img/b.png"), atomically: true, encoding: .utf8)
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let item = try library.add(markdown: "# T\n\n![a](a.png) ![b](img/b.png)", name: "My Template", description: "d",
                                   assets: ["a.png", "img/b.png"], from: cache)
        #expect(item.id == "my-template")
        #expect(try String(contentsOf: item.documentURL(), encoding: .utf8).hasPrefix("# T"))
        #expect(try item.documentURL().lastPathComponent == "my-template.md")
        #expect(FileManager.default.fileExists(atPath: item.url.appendingPathComponent("a.png").path))
        #expect(try String(contentsOf: item.url.appendingPathComponent("img/b.png"), encoding: .utf8) == "png2")
        #expect(library.items().map(\.manifest.name) == ["My Template"])
    }

    @Test func addingMarkdownSkipsAnAssetWhoseFileIsMissing() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = root.appendingPathComponent("cache")
        try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let item = try library.add(markdown: "text", name: "Plain", description: "", assets: ["missing.png"], from: cache)
        let files = try FileManager.default.contentsOfDirectory(atPath: item.url.path).sorted()
        #expect(files == ["manifest.json", "plain.md"])
    }

    private func assetProblems(_ assets: [String]) -> [String] {
        do { try UserLibrary.validate(assets: assets); return [] } catch LibraryError.invalidFolder(let found) { return found } catch { return ["\(error)"] }
    }

    @Test func imageAssetsAtTheTopAndInOneSubfolderConform() {
        #expect(assetProblems([]).isEmpty)
        #expect(assetProblems(["a.png", "img/b.JPG", "img/my%20pic.png"]).isEmpty)
    }

    @Test func assetsThatAreNotImagesOrAreNestedOrInSeveralFoldersAreRefused() {
        let found = assetProblems(["notes.pdf", "one/a.png", "two/b.png", "one/deep/c.png"])
        #expect(found.contains { $0.hasPrefix("Only image files are allowed.") && $0.contains("notes.pdf") })
        #expect(found.contains { $0.hasPrefix("Images may be at the top or in one subfolder, not nested deeper.") && $0.contains("one/deep/c.png") })
        #expect(found.contains { $0.hasPrefix("Images may be in only one subfolder.") && $0.contains("one, two") })
    }

    @Test func assetsOutsideTheDocumentFolderAreRefused() {
        let found = assetProblems(["../up.png", "/etc/x.png", "a/../b.png", "%2E%2E/c.png"])
        #expect(found.count == 1)
        #expect(found[0].hasPrefix("Images must be inside the document's folder.") && found[0].contains("4 found"))
    }

    @Test func addingMarkdownWithNonconformingAssetsLeavesNothingBehind() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        #expect(throws: (any Error).self) {
            try library.add(markdown: "x", name: "Bad", description: "", assets: ["a/b/c.png"], from: root)
        }
        #expect(library.items().isEmpty)
        #expect(((try? FileManager.default.contentsOfDirectory(atPath: library.directory.path)) ?? []).isEmpty)
    }

    @Test func addingMarkdownRefusesAnEmptyNameAndGivesDuplicateNamesDistinctFolders() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        #expect(throws: LibraryError.emptyName) { try library.add(markdown: "x", name: " ", description: "", assets: [], from: root) }
        let first = try library.add(markdown: "x", name: "Same", description: "", assets: [], from: root)
        let second = try library.add(markdown: "y", name: "Same", description: "", assets: [], from: root)
        #expect(first.id == "same" && second.id == "same-2")
        #expect(library.items().count == 2)
    }

    private func makeFolder(_ files: [String: String]) throws -> URL {
        let root = try temporaryDirectory()
        for (path, text) in files {
            let url = root.appendingPathComponent(path)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            try text.write(to: url, atomically: true, encoding: .utf8)
        }
        return root
    }

    private func problems(in folder: URL) -> [String] {
        do { try UserLibrary.validate(folder: folder); return [] } catch LibraryError.invalidFolder(let found) { return found } catch { return ["\(error)"] }
    }

    @Test func aFolderMayHoldImagesAtTheTopAndInOneSubfolder() throws {
        let both = try makeFolder(["a.md": "x", "manifest.json": "{}", "top.png": "p", "img/b.JPG": "p", ".DS_Store": "junk", "img/.hidden": "junk"])
        defer { try? FileManager.default.removeItem(at: both) }
        #expect(problems(in: both).isEmpty)
        let topOnly = try makeFolder(["a.md": "x", "top.png": "p"])
        defer { try? FileManager.default.removeItem(at: topOnly) }
        #expect(problems(in: topOnly).isEmpty)
        let subOnly = try makeFolder(["a.md": "x", "img/b.png": "p"])
        defer { try? FileManager.default.removeItem(at: subOnly) }
        #expect(problems(in: subOnly).isEmpty)
    }

    @Test func aFolderNeedsExactlyOneMarkdownFile() throws {
        let none = try makeFolder(["top.png": "p"])
        let two = try makeFolder(["a.md": "x", "b.md": "y"])
        defer { try? FileManager.default.removeItem(at: none); try? FileManager.default.removeItem(at: two) }
        #expect(problems(in: none).first?.contains("exactly one Markdown file; it holds 0") == true)
        #expect(problems(in: two).first?.contains("it holds 2") == true)
    }

    @Test func otherFilesMoreSubfoldersAndNestedFoldersAreRefused() throws {
        let folder = try makeFolder(["a.md": "x", "notes.pdf": "n", "one/a.png": "p", "two/b.png": "p", "one/deep/c.png": "p", "one/readme.txt": "t"])
        defer { try? FileManager.default.removeItem(at: folder) }
        let found = problems(in: folder)
        #expect(found.contains { $0.hasPrefix("Besides the Markdown file and manifest.json, only image files are allowed.") && $0.contains("notes.pdf") })
        #expect(found.contains { $0.hasPrefix("At most one subfolder is allowed, for images.") && $0.contains("two") })
        #expect(found.contains { $0.hasPrefix("The image subfolder may hold only image files.") && $0.contains("2 found") && $0.contains("one/deep") })
        #expect(found.count == 3)
    }

    @Test func linksAndAManifestFolderAreRefused() throws {
        let folder = try makeFolder(["a.md": "x", "real.png": "p"])
        defer { try? FileManager.default.removeItem(at: folder) }
        try FileManager.default.createSymbolicLink(at: folder.appendingPathComponent("link.png"), withDestinationURL: folder.appendingPathComponent("real.png"))
        try FileManager.default.createDirectory(at: folder.appendingPathComponent("manifest.json"), withIntermediateDirectories: false)
        let found = problems(in: folder)
        #expect(found.contains { $0.hasPrefix("Links are not allowed.") && $0.contains("link.png") })
        #expect(found.contains { $0.hasPrefix("manifest.json must be a file") })
    }

    @Test func addingAFolderCopiesOnlyWhatItAllowsAndIgnoresTheSourceManifestDocumentKey() throws {
        let source = try makeFolder(["post.md": "x", "top.png": "p", "img/b.png": "q", ".DS_Store": "junk",
                                     "manifest.json": #"{"name": "Old", "description": "d", "document": "gone.md"}"#])
        defer { try? FileManager.default.removeItem(at: source) }
        let out = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: out) }
        let library = UserLibrary(directory: out.appendingPathComponent("library"))
        let item = try library.add(from: source, name: "New", description: "n")
        let files = try FileManager.default.subpathsOfDirectory(atPath: item.url.path).sorted()
        #expect(files == ["img", "img/b.png", "manifest.json", "post.md", "top.png"])
        #expect(try item.documentURL().lastPathComponent == "post.md")
        #expect(library.items().map(\.manifest.name) == ["New"])
    }

    @Test func addingAnInvalidFolderLeavesNothingBehind() throws {
        let source = try makeFolder(["a.md": "x", "b.md": "y"])
        defer { try? FileManager.default.removeItem(at: source) }
        let out = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: out) }
        let library = UserLibrary(directory: out.appendingPathComponent("lib"))
        #expect(throws: (any Error).self) { try library.add(from: source, name: "Bad", description: "") }
        #expect(library.items().isEmpty)
        #expect(((try? FileManager.default.contentsOfDirectory(atPath: library.directory.path)) ?? []).isEmpty)
    }

    @Test func itemsSkipsAFolderWhoseDocumentCannotBeFound() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        try makeItem(in: root, folder: "good", name: "Good", files: ["g.md": "g"])
        try makeItem(in: root, folder: "two", name: "Two", files: ["a.md": "a", "b.md": "b"])
        try makeItem(in: root, folder: "none", name: "None", files: ["pic.png": "p"])
        #expect(UserLibrary(directory: root).items().map(\.manifest.name) == ["Good"])
    }

    @Test func addingMarkdownDecodesPercentEncodedAssetPaths() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let cache = root.appendingPathComponent("cache")
        try FileManager.default.createDirectory(at: cache, withIntermediateDirectories: true)
        try "png".write(to: cache.appendingPathComponent("my pic.png"), atomically: true, encoding: .utf8)
        let library = UserLibrary(directory: root.appendingPathComponent("library"))
        let item = try library.add(markdown: "![x](my%20pic.png)", name: "Spaces", description: "", assets: ["my%20pic.png"], from: cache)
        #expect(FileManager.default.fileExists(atPath: item.url.appendingPathComponent("my pic.png").path))
    }

    @Test func theMessageStaysShortHoweverManyFilesBreakTheRules() throws {
        var files = ["a.md": "x"]
        for i in 0..<2000 { files["doc\(i).pdf"] = "p" }
        for i in 0..<50 { files["sub\(i)/inner.txt"] = "t" }
        let folder = try makeFolder(files)
        defer { try? FileManager.default.removeItem(at: folder) }
        let found = problems(in: folder)
        #expect(found.count <= 4)
        #expect(found.joined(separator: "\n").count < 700)
        #expect(found.contains { $0.contains("2000 found") })
        #expect(found.contains { $0.contains("49 found") })
    }

    @Test func theAssetMessageStaysShortHoweverManyAssetsBreakTheRules() {
        let assets = (0..<5000).map { "dir\($0)/deep/x\($0).pdf" } + (0..<5000).map { "../up\($0).png" }
        let found = assetProblems(assets)
        #expect(found.count <= 5)
        #expect(found.joined(separator: "\n").count < 800)
    }
}
