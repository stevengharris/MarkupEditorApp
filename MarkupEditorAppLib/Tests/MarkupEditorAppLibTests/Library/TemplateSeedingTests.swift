//
//  TemplateSeedingTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

@MainActor
struct TemplateSeedingTests {

    private let index = Data("""
        [{"folder": "a", "name": "A", "description": "About A", "file": "a.md"},
         {"folder": "b", "name": "B", "description": "About B", "file": "b.md"}]
        """.utf8)

    private func files(_ name: String) -> Data? { Data("text of \(name)".utf8) }

    private func scratch() throws -> (library: UserLibrary, defaults: UserDefaults, cleanup: () -> Void) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("TemplateSeedingTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let suite = "TemplateSeedingTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: suite))
        return (UserLibrary(directory: root.appendingPathComponent("library")), defaults, {
            try? FileManager.default.removeItem(at: root)
            defaults.removePersistentDomain(forName: suite)
        })
    }

    @Test func theFirstLaunchSeedsEveryBuiltInAndRecordsTheirNames() throws {
        let (library, defaults, cleanup) = try scratch()
        defer { cleanup() }
        let seeded = TemplateSeeding.seed(into: library, index: { index }, data: files, defaults: defaults, log: EditLog())
        #expect(seeded.sorted() == ["a", "b"])
        #expect(library.items().map(\.manifest.name) == ["A", "B"])
        #expect(Set(defaults.stringArray(forKey: TemplateSeeding.seededKey) ?? []) == ["a", "b"])
    }

    @Test func aTemplateTheUserDeletedIsNotPutBackOnTheNextLaunch() throws {
        let (library, defaults, cleanup) = try scratch()
        defer { cleanup() }
        TemplateSeeding.seed(into: library, index: { index }, data: files, defaults: defaults, log: EditLog())
        try FileManager.default.removeItem(at: library.directory.appendingPathComponent("a"))

        let again = TemplateSeeding.seed(into: library, index: { index }, data: files, defaults: defaults, log: EditLog())
        #expect(again.isEmpty)
        #expect(library.items().map(\.manifest.name) == ["B"])
    }

    @Test func aBuiltInAddedLaterIsSeededAndTheRecordKeepsTheEarlierNames() throws {
        let (library, defaults, cleanup) = try scratch()
        defer { cleanup() }
        let first = Data(#"[{"folder": "a", "name": "A", "description": "", "file": "a.md"}]"#.utf8)
        TemplateSeeding.seed(into: library, index: { first }, data: files, defaults: defaults, log: EditLog())

        let later = TemplateSeeding.seed(into: library, index: { index }, data: files, defaults: defaults, log: EditLog())
        #expect(later == ["b"])
        #expect(Set(defaults.stringArray(forKey: TemplateSeeding.seededKey) ?? []) == ["a", "b"])
    }

    @Test func anUnreadableIndexLogsAWarningAndSeedsNothing() throws {
        let (library, defaults, cleanup) = try scratch()
        defer { cleanup() }
        let log = EditLog()
        let seeded = TemplateSeeding.seed(
            into: library, index: { throw TemplateSeeding.Failure.indexMissing }, data: files, defaults: defaults, log: log)
        #expect(seeded.isEmpty)
        #expect(library.items().isEmpty)
        #expect(defaults.stringArray(forKey: TemplateSeeding.seededKey) == nil)
        #expect(log.entries.contains { $0.message.contains("templates.json is missing") })
    }

    @Test func aMalformedIndexLogsAWarningAndSeedsNothing() throws {
        let (library, defaults, cleanup) = try scratch()
        defer { cleanup() }
        let log = EditLog()
        let seeded = TemplateSeeding.seed(into: library, index: { Data("not json".utf8) }, data: files, defaults: defaults, log: log)
        #expect(seeded.isEmpty)
        #expect(library.items().isEmpty)
        #expect(log.entries.contains { $0.message.contains("could not be read") })
    }
}
