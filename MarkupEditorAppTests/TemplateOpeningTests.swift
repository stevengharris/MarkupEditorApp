//
//  TemplateOpeningTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
import MarkupEditorAppLib
@testable import MarkupEditorApp

@MainActor
struct TemplateOpeningTests {

    private struct ImportFailure: Error {}

    private func scratch() throws -> (root: URL, destination: URL) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("TemplateOpeningTests-\(UUID().uuidString)")
        let destination = root.appendingPathComponent("cache")
        try FileManager.default.createDirectory(at: destination, withIntermediateDirectories: true)
        return (root, destination)
    }

    /// A template item whose folder holds `files` and whose manifest names `document`.
    private func item(in root: URL, document: String?, files: [String: Data]) throws -> UserLibraryItem {
        let folder = root.appendingPathComponent("template")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        for (name, data) in files { try data.write(to: folder.appendingPathComponent(name)) }
        return UserLibraryItem(url: folder, manifest: LibraryManifest(name: "T", description: "", document: document))
    }

    private let importer: (String) async throws -> (html: String, metadata: [MetadataTuple]) = { markdown in
        ("<p>\(markdown.count)</p>", [])
    }

    private func contents(of directory: URL) -> [String] {
        ((try? FileManager.default.contentsOfDirectory(atPath: directory.path)) ?? []).sorted()
    }

    @Test func theTemplatesMarkdownIsConvertedAndItsImagesAreCopied() async throws {
        let (root, destination) = try scratch()
        defer { try? FileManager.default.removeItem(at: root) }
        let item = try item(in: root, document: nil, files: ["t.md": Data("![pic](pic.png)".utf8), "pic.png": Data([1, 2, 3])])

        let prepared = try await TemplateOpening.prepare(item, document: MarkupDocument(), imagesTo: destination, importer: importer)
        #expect(prepared.markdown == "![pic](pic.png)")
        #expect(prepared.html == "<p>15</p>")
        #expect(contents(of: destination) == ["pic.png"])
    }

    @Test func aMissingImageIsSkippedNotAnError() async throws {
        let (root, destination) = try scratch()
        defer { try? FileManager.default.removeItem(at: root) }
        let item = try item(in: root, document: nil, files: ["t.md": Data("![gone](gone.png)".utf8)])

        let prepared = try await TemplateOpening.prepare(item, document: MarkupDocument(), imagesTo: destination, importer: importer)
        #expect(prepared.markdown == "![gone](gone.png)")
        #expect(contents(of: destination).isEmpty)
    }

    @Test func aMissingDocumentFileThrowsBeforeAnythingIsConvertedOrCopied() async throws {
        let (root, destination) = try scratch()
        defer { try? FileManager.default.removeItem(at: root) }
        let item = try item(in: root, document: "gone.md", files: ["pic.png": Data([1])])
        var imported = false

        await #expect(throws: (any Error).self) {
            _ = try await TemplateOpening.prepare(item, document: MarkupDocument(), imagesTo: destination) { _ in
                imported = true
                return ("", [])
            }
        }
        #expect(!imported)
        #expect(contents(of: destination).isEmpty)
    }

    @Test func aDocumentThatIsNotTextThrowsBeforeAnythingIsCopied() async throws {
        let (root, destination) = try scratch()
        defer { try? FileManager.default.removeItem(at: root) }
        let item = try item(in: root, document: nil, files: ["t.md": Data([0xFF, 0xFE, 0xFD]), "pic.png": Data([1])])

        await #expect(throws: (any Error).self) {
            _ = try await TemplateOpening.prepare(item, document: MarkupDocument(), imagesTo: destination, importer: importer)
        }
        #expect(contents(of: destination).isEmpty)
    }

    @Test func aFailedConversionThrowsBeforeAnyImageIsCopied() async throws {
        let (root, destination) = try scratch()
        defer { try? FileManager.default.removeItem(at: root) }
        let item = try item(in: root, document: nil, files: ["t.md": Data("![pic](pic.png)".utf8), "pic.png": Data([1])])

        await #expect(throws: ImportFailure.self) {
            _ = try await TemplateOpening.prepare(item, document: MarkupDocument(), imagesTo: destination) { _ in throw ImportFailure() }
        }
        #expect(contents(of: destination).isEmpty)
    }
}
