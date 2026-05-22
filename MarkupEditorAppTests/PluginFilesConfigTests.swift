//
//  PluginFilesConfigTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp
import MarkupEditor

// Tests for AppConfig.pluginFiles(from:pluginDir:) — the function that converts
// PluginConfigEntry values into PluginFileEntry values by resolving each filename
// against a plugin directory and filtering out missing files.

struct PluginFilesConfigTests {

    // MARK: - Helpers

    /// Returns a fresh temporary directory URL (created on disk).
    private func makeTempDir() throws -> URL {
        let base = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("PluginFilesConfigTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    /// Writes a minimal JS placeholder file at the given directory, returning the URL.
    private func writePluginFile(named filename: String, in dir: URL) throws -> URL {
        let url = dir.appendingPathComponent(filename)
        try "// placeholder".write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    // MARK: - One plugin, file exists → one PluginFileEntry with absolute path

    @Test func onePluginFileExistsProducesOneEntry() throws {
        let pluginDir = try makeTempDir()
        let filename = "markup-editor-markdown.js"
        _ = try writePluginFile(named: filename, in: pluginDir)

        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: filename)]
        let result = AppConfig.pluginFiles(from: entries, pluginDir: pluginDir)

        #expect(result.count == 1)
        #expect(result[0].name == "Markdown")
        let expectedPath = pluginDir.appendingPathComponent(filename).path
        #expect(result[0].path == expectedPath)
    }

    // MARK: - One plugin, file missing → pluginFiles is empty (skip, do not throw)

    @Test func onePluginFileMissingProducesEmptyResult() throws {
        let pluginDir = try makeTempDir()
        let filename = "markup-editor-markdown.js"
        // File is intentionally NOT written

        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: filename)]
        let result = AppConfig.pluginFiles(from: entries, pluginDir: pluginDir)

        #expect(result.isEmpty)
    }

    // MARK: - No plugins (nil → treated as empty) → pluginFiles is empty

    @Test func nilPluginsProducesEmptyResult() throws {
        let pluginDir = try makeTempDir()

        let result = AppConfig.pluginFiles(from: nil, pluginDir: pluginDir)

        #expect(result.isEmpty)
    }

    // MARK: - No plugins (empty array) → pluginFiles is empty

    @Test func emptyPluginsProducesEmptyResult() throws {
        let pluginDir = try makeTempDir()

        let result = AppConfig.pluginFiles(from: [], pluginDir: pluginDir)

        #expect(result.isEmpty)
    }

    // MARK: - Mixed: one file exists, one missing → only the existing one is returned

    @Test func mixedExistenceReturnsOnlyExistingEntries() throws {
        let pluginDir = try makeTempDir()
        let presentFile = "markup-editor-markdown.js"
        let absentFile = "markup-editor-missing.js"
        _ = try writePluginFile(named: presentFile, in: pluginDir)

        let entries = [
            AppConfig.PluginConfigEntry(name: "Markdown", filename: presentFile),
            AppConfig.PluginConfigEntry(name: "Missing", filename: absentFile)
        ]
        let result = AppConfig.pluginFiles(from: entries, pluginDir: pluginDir)

        #expect(result.count == 1)
        #expect(result[0].name == "Markdown")
    }

}
