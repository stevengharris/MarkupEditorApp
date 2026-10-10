//
//  CodeViewManagerTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorAppLib

private let testCacheDir = FileManager.default.temporaryDirectory.appendingPathComponent("CodeViewManagerTests-cache", isDirectory: true)

// .serialized: several tests here exercise syncInternalPlugins(), which derives its filenames
// internally from CodeViewManager.InternalCodeView.allCases (not caller-injectable) and writes
// into the real, shared CodeViewManager.defaultDir -- run in parallel, two such tests race on the
// same path. PluginInstallerTests avoids this by using a uniquely-named test plugin; that's not
// an option here since the whole point is exercising the real internal-plugin names/filenames.
@Suite(.serialized)
struct CodeViewManagerTests {

    /// `CodeViewManager.defaultDir` (~/Library/Application Support/codeviews) is normally
    /// created once by `setupOnLaunch()` at real app startup, same precondition
    /// `PluginInstallerTests` establishes directly since there's no host app here.
    private func ensureDefaultDirExists() throws {
        try FileManager.default.createDirectory(at: CodeViewManager.defaultDir, withIntermediateDirectories: true)
    }

    /// Removes a copied codeview file directly via FileManager, bypassing
    /// `CodeViewManager.delete()` -- which, for a protected name, is exactly the thing under
    /// test and can't be relied on to clean up after itself.
    private func removeDirectly(filename: String) {
        try? FileManager.default.removeItem(at: CodeViewManager.defaultDir.appendingPathComponent(filename))
    }

    @Test func protectedNamesContainsAllInternalCodeViews() {
        for internalCodeView in CodeViewManager.InternalCodeView.allCases {
            #expect(CodeViewManager.protectedNames.contains(internalCodeView.rawValue))
        }
    }

    @Test func addRefusesAProtectedNameByDefault() throws {
        try ensureDefaultDirExists()
        let sourceDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: sourceDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: sourceDir) }
        let sourceFile = sourceDir.appendingPathComponent("hijack-attempt.js")
        try Data("// not the real plugin".utf8).write(to: sourceFile)

        let result = CodeViewManager.add(name: "Metadata", url: sourceFile, exporters: [], codeViews: [], cacheDir: testCacheDir)

        #expect(result.isEmpty)
        #expect(!FileManager.default.fileExists(atPath: CodeViewManager.defaultDir.appendingPathComponent("hijack-attempt.js").path(percentEncoded: false)))
    }

    @Test func addAllowsAProtectedNameWithTheEscapeHatch() throws {
        try ensureDefaultDirExists()
        let sourceDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: sourceDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: sourceDir) }
        let sourceFile = sourceDir.appendingPathComponent("codeview-metadata-test.js")
        try Data("// stand-in for the real bundle resource".utf8).write(to: sourceFile)
        defer { removeDirectly(filename: "codeview-metadata-test.js") }

        let result = CodeViewManager.add(name: "Metadata", url: sourceFile, exporters: [], codeViews: [], cacheDir: testCacheDir, allowProtectedNames: true)

        #expect(CodeViewManager.nameExists("Metadata", in: result))
        #expect(result.first(where: { $0.name == "Metadata" })?.filename == sourceFile.lastPathComponent)
    }

    @Test func deleteRefusesAProtectedName() throws {
        try ensureDefaultDirExists()
        let filename = "codeview-metadata-delete-test.js"
        let destination = CodeViewManager.defaultDir.appendingPathComponent(filename)
        try Data("// stand-in".utf8).write(to: destination)
        defer { removeDirectly(filename: filename) }

        let plugin = Plugin(name: "Metadata", type: "codeview", filename: filename)
        let result = CodeViewManager.delete(plugin, codeViews: [plugin], cacheDir: testCacheDir)

        #expect(result == [plugin]) // unchanged -- refused, not removed
        #expect(FileManager.default.fileExists(atPath: destination.path(percentEncoded: false)))
    }

    /// Writes a stand-in bundle file into `resourceDir` for every `InternalCodeView` case,
    /// so `syncInternalPlugins` (which iterates all of them, not just one) has something to
    /// find for each. Returns the filenames so the caller can clean them up afterward.
    private func writeStandInBundles(in resourceDir: URL, contents: String) throws -> [String] {
        try CodeViewManager.InternalCodeView.allCases.map { internalCodeView in
            let file = resourceDir.appendingPathComponent(internalCodeView.filename)
            try Data(contents.utf8).write(to: file)
            return internalCodeView.filename
        }
    }

    @Test func syncInternalPluginsInstallsFromTheGivenResourceURL() throws {
        try ensureDefaultDirExists()
        let resourceDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: resourceDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: resourceDir) }
        let filenames = try writeStandInBundles(in: resourceDir, contents: "// stand-in for the real bundled plugin")
        defer { for filename in filenames { removeDirectly(filename: filename) } }

        let result = CodeViewManager.syncInternalPlugins(exporters: [], codeViews: [], resourceURL: resourceDir, cacheDir: testCacheDir)

        for internalCodeView in CodeViewManager.InternalCodeView.allCases {
            #expect(CodeViewManager.nameExists(internalCodeView.rawValue, in: result))
        }
    }

    @Test func syncInternalPluginsIsSafeToCallRepeatedly() throws {
        // Re-synced every launch: a second call with the same resourceURL must not
        // regress into being refused by its own earlier install -- this is the un-gated,
        // every-launch call site, so it has to be idempotent across repeated calls.
        try ensureDefaultDirExists()
        let resourceDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: resourceDir, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: resourceDir) }
        let filenames = try writeStandInBundles(in: resourceDir, contents: "// v1")
        defer { for filename in filenames { removeDirectly(filename: filename) } }

        let firstResult = CodeViewManager.syncInternalPlugins(exporters: [], codeViews: [], resourceURL: resourceDir, cacheDir: testCacheDir)
        let secondResult = CodeViewManager.syncInternalPlugins(exporters: [], codeViews: firstResult, resourceURL: resourceDir, cacheDir: testCacheDir)

        for internalCodeView in CodeViewManager.InternalCodeView.allCases {
            #expect(secondResult.filter { $0.name == internalCodeView.rawValue }.count == 1)
        }
    }

    @Test func syncInternalPluginsReturnsCodeViewsUnchangedWhenResourceURLIsNil() {
        let existing = [Plugin(name: "Mermaid", type: "codeview", filename: "codeview-mermaid.js")]
        let result = CodeViewManager.syncInternalPlugins(exporters: [], codeViews: existing, resourceURL: nil, cacheDir: testCacheDir)
        #expect(result == existing)
    }
}
