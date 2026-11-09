//
//  ImageAssetCopyTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor
struct ImageAssetCopyTests {

    private func folder() throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ImageAssetCopyTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    @Test func aPercentEncodedSrcFindsTheFileWithTheSpace() throws {
        let root = try folder()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("src"), dest = root.appendingPathComponent("dest")
        try FileManager.default.createDirectory(at: source, withIntermediateDirectories: true)
        try "png".write(to: source.appendingPathComponent("my pic.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().copyImageAssets(srcs: ["my%20pic.png"], from: source, to: dest, skipMissing: false, replaceExisting: false)
        #expect(FileManager.default.fileExists(atPath: dest.appendingPathComponent("my pic.png").path))
    }

    @Test func aSrcThatClimbsOutOfTheFolderIsSkipped() throws {
        let root = try folder()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("src"), dest = root.appendingPathComponent("dest")
        try FileManager.default.createDirectory(at: source, withIntermediateDirectories: true)
        try "secret".write(to: root.appendingPathComponent("outside.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().copyImageAssets(srcs: ["../outside.png", "%2E%2E/outside.png"], from: source, to: dest, skipMissing: false, replaceExisting: true)
        #expect(!FileManager.default.fileExists(atPath: dest.path))
        #expect(try String(contentsOf: root.appendingPathComponent("outside.png"), encoding: .utf8) == "secret")
    }

    @Test func aFileNamedWithAPercentSequenceIsFoundByItsLiteralSrc() throws {
        let root = try folder()
        defer { try? FileManager.default.removeItem(at: root) }
        let source = root.appendingPathComponent("src"), dest = root.appendingPathComponent("dest")
        try FileManager.default.createDirectory(at: source, withIntermediateDirectories: true)
        try "png".write(to: source.appendingPathComponent("100%25.png"), atomically: true, encoding: .utf8)
        try MarkupDocument().copyImageAssets(srcs: ["100%25.png"], from: source, to: dest, skipMissing: false, replaceExisting: false)
        #expect(FileManager.default.fileExists(atPath: dest.appendingPathComponent("100%25.png").path))
    }
}
