//
//  BuiltInRestoreTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct BuiltInRestoreTests {

    private func scratch() throws -> (library: UserLibrary, cleanup: () -> Void) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("BuiltInRestoreTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return (UserLibrary(directory: root.appendingPathComponent("library")), { try? FileManager.default.removeItem(at: root) })
    }

    private func builtIn(text: String = "original") -> UserLibrary.BuiltIn {
        UserLibrary.BuiltIn(
            folder: "readme", manifest: LibraryManifest(name: "README", description: "About README"),
            files: ["readme.md": Data(text.utf8)])
    }

    private func text(of library: UserLibrary, _ file: String = "readme.md") throws -> String {
        try String(contentsOf: library.directory.appendingPathComponent("readme/\(file)"), encoding: .utf8)
    }

    @Test func aFreshlySeededBuiltInIsNotModified() throws {
        let (library, cleanup) = try scratch()
        defer { cleanup() }
        library.seed([builtIn()], skipping: [])
        #expect(!library.isModified(builtIn()))
    }

    @Test func aBuiltInTheUserDeletedIsNotModified() throws {
        let (library, cleanup) = try scratch()
        defer { cleanup() }
        #expect(!library.isModified(builtIn()))
    }

    @Test func editingTheDocumentMakesItModifiedAndRestoringPutsTheOriginalBack() throws {
        let (library, cleanup) = try scratch()
        defer { cleanup() }
        library.seed([builtIn()], skipping: [])
        try "changed".write(to: library.directory.appendingPathComponent("readme/readme.md"), atomically: true, encoding: .utf8)
        #expect(library.isModified(builtIn()))

        try library.restore(builtIn())
        #expect(try text(of: library) == "original")
        #expect(!library.isModified(builtIn()))
    }

    @Test func renamingMakesItModifiedAndRestoringPutsTheNameAndDescriptionBack() throws {
        let (library, cleanup) = try scratch()
        defer { cleanup() }
        library.seed([builtIn()], skipping: [])
        let item = try #require(library.items().first)
        try library.update(item, name: "My README", description: "Mine")
        #expect(library.isModified(builtIn()))

        try library.restore(builtIn())
        let restored = try #require(library.items().first)
        #expect(restored.manifest.name == "README" && restored.manifest.description == "About README")
        #expect(!library.isModified(builtIn()))
    }

    @Test func aMissingDocumentFileMakesItModifiedAndRestoringRecreatesIt() throws {
        let (library, cleanup) = try scratch()
        defer { cleanup() }
        library.seed([builtIn()], skipping: [])
        try FileManager.default.removeItem(at: library.directory.appendingPathComponent("readme/readme.md"))
        #expect(library.isModified(builtIn()))

        try library.restore(builtIn())
        #expect(try text(of: library) == "original")
    }

    @Test func aNewerBuiltInVersionMakesAnUntouchedCopyModified() throws {
        let (library, cleanup) = try scratch()
        defer { cleanup() }
        library.seed([builtIn(text: "old")], skipping: [])
        #expect(library.isModified(builtIn(text: "new")))

        try library.restore(builtIn(text: "new"))
        #expect(try text(of: library) == "new")
    }

    @Test func restoringLeavesFilesTheUserAddedAlone() throws {
        let (library, cleanup) = try scratch()
        defer { cleanup() }
        library.seed([builtIn()], skipping: [])
        try Data([1, 2, 3]).write(to: library.directory.appendingPathComponent("readme/logo.png"))
        try "changed".write(to: library.directory.appendingPathComponent("readme/readme.md"), atomically: true, encoding: .utf8)

        try library.restore(builtIn())
        #expect(FileManager.default.fileExists(atPath: library.directory.appendingPathComponent("readme/logo.png").path))
        #expect(!library.isModified(builtIn()))
    }
}
