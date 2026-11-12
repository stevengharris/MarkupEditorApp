//
//  LibraryLoggingTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

/// Failures the library swallows are recorded to `EditLog.shared`. Other suites also record there, so each
/// test names its folders and plugins with a unique tag and looks only at its own entries. Running on the
/// main actor makes each `record` append at once.
@MainActor
@Suite(.serialized)
struct LibraryLoggingTests {

    private func mine(_ tag: String) -> [LogEntry] {
        EditLog.shared.entries.filter { $0.message.contains(tag) }
    }

    private func temporaryDirectory() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("LibraryLoggingTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    // MARK: Template scan

    @Test func scanningTheSameBrokenTemplateTwiceIsOneEntryWithACountOfTwo() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let tag = "broken-\(UUID().uuidString)"
        let dir = root.appendingPathComponent(tag)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        try "{ not json".write(to: dir.appendingPathComponent(UserLibraryItem.manifestName), atomically: true, encoding: .utf8)
        let library = UserLibrary(directory: root)

        _ = library.items()
        EditLog.shared.info("unrelated entry between the scans")
        _ = library.items()

        let entries = mine(tag)
        #expect(entries.count == 1)
        #expect(entries.first?.count == 2)
        #expect(entries.first?.level == .warning)
        #expect(entries.first?.category == "Template")
    }

    @Test func aDifferentProblemInTheSameTemplateFolderIsANewEntry() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let tag = "changing-\(UUID().uuidString)"
        let dir = root.appendingPathComponent(tag)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let manifest = dir.appendingPathComponent(UserLibraryItem.manifestName)
        try "{ not json".write(to: manifest, atomically: true, encoding: .utf8)
        let library = UserLibrary(directory: root)
        _ = library.items()

        try JSONEncoder().encode(LibraryManifest(name: "Named", description: "d", document: nil)).write(to: manifest)
        _ = library.items()

        let entries = mine(tag)
        #expect(entries.count == 2)
        #expect(entries.map(\.count) == [1, 1])
    }

    // MARK: Seeding

    @Test func aSeedThatCannotBeWrittenIsRecordedAsAnError() throws {
        let root = try temporaryDirectory()
        defer { try? FileManager.default.removeItem(at: root) }
        let blocker = root.appendingPathComponent("blocker")
        try "a file".write(to: blocker, atomically: true, encoding: .utf8)
        let tag = "seed-\(UUID().uuidString)"
        let builtIn = UserLibrary.BuiltIn(folder: tag, manifest: LibraryManifest(name: "Seed", description: "d"), files: ["\(tag).md": Data("x".utf8)])

        let written = UserLibrary(directory: blocker.appendingPathComponent("library")).seed([builtIn], skipping: [])

        #expect(written.isEmpty)
        let entries = mine(tag)
        #expect(entries.count == 1)
        #expect(entries.first?.level == .error)
        #expect(entries.first?.message.hasPrefix("Could not seed") == true)
    }

    @Test func aBuiltInMissingItsFileIsRecordedAsAWarning() throws {
        let tag = "missing-\(UUID().uuidString)"
        let index = Data(#"[{"folder":"\#(tag)","name":"Missing","description":"d","file":"\#(tag).md"}]"#.utf8)

        let builtIns = try UserLibrary.builtIns(index: index, data: { _ in nil })

        #expect(builtIns.isEmpty)
        let entries = mine(tag)
        #expect(entries.count == 1)
        #expect(entries.first?.level == .warning)
    }

    // MARK: Plugin catalog

    private func catalogJSON(name: String, repo: String = "https://example.com/r", source: String = "https://example.com/s.js") -> Data {
        Data("""
        {"codeview":{"\(name)":{"name":"\(name)","filename":"m.js","description":"d","author":"a","version":"1.0.0","repo":"\(repo)","source":"\(source)"}}}
        """.utf8)
    }

    @Test func aSkippedCatalogEntryDecodedTwiceIsOneEntryWithACountOfTwo() throws {
        let name = "Evil-\(UUID().uuidString)"
        let data = catalogJSON(name: name, source: "javascript:alert(1)")

        _ = try JSONDecoder().decode(PluginCatalog.self, from: data)
        EditLog.shared.info("unrelated entry between the loads")
        _ = try JSONDecoder().decode(PluginCatalog.self, from: data)

        let entries = mine(name)
        #expect(entries.count == 1)
        #expect(entries.first?.count == 2)
        #expect(entries.first?.level == .warning)
    }

    @Test func aDifferentProblemWithTheSameCatalogEntryIsANewEntry() throws {
        let name = "Evil-\(UUID().uuidString)"
        _ = try JSONDecoder().decode(PluginCatalog.self, from: catalogJSON(name: name, source: "javascript:alert(1)"))
        _ = try JSONDecoder().decode(PluginCatalog.self, from: catalogJSON(name: name, repo: "javascript:alert(1)"))

        let entries = mine(name)
        #expect(entries.count == 2)
        #expect(entries.map(\.count) == [1, 1])
    }
}
