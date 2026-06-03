//
//  PluginSetupTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

// Tests for PluginSetup.setupPluginDirectory(entries:pluginDir:bundle:fileManager:)
//
// All tests use a temporary directory to avoid touching the real Application Support
// folder and to allow full control over the filesystem state.
struct PluginSetupTests {

    // MARK: - Helpers

    /// Returns a fresh temporary directory URL (created on disk).
    private func makeTempDir() throws -> URL {
        let base = URL(fileURLWithPath: NSTemporaryDirectory())
            .appendingPathComponent("PluginSetupTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base
    }

    /// Writes a minimal JS file to the given bundle directory, returning the URL.
    private func writeBundleFile(named filename: String, in dir: URL) throws -> URL {
        let url = dir.appendingPathComponent(filename)
        try "// placeholder".write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    // MARK: - Directory creation

    @Test func createsPluginDirectoryWhenAbsent() throws {
        let tmp = try makeTempDir()
        let pluginDir = tmp.appendingPathComponent("Plugins")
        let bundleDir = tmp.appendingPathComponent("Bundle")
        try FileManager.default.createDirectory(at: bundleDir, withIntermediateDirectories: true)

        // Directory does not exist yet
        #expect(!FileManager.default.fileExists(atPath: pluginDir.path))

        PluginSetup.setupPluginDirectory(
            entries: [],
            pluginDir: pluginDir,
            bundleResourceURL: bundleDir
        )

        #expect(FileManager.default.fileExists(atPath: pluginDir.path))
    }

    @Test func doesNotFailWhenPluginDirectoryAlreadyExists() throws {
        let tmp = try makeTempDir()
        let pluginDir = tmp.appendingPathComponent("Plugins")
        try FileManager.default.createDirectory(at: pluginDir, withIntermediateDirectories: true)
        let bundleDir = tmp.appendingPathComponent("Bundle")
        try FileManager.default.createDirectory(at: bundleDir, withIntermediateDirectories: true)

        // Should not throw or crash
        PluginSetup.setupPluginDirectory(
            entries: [],
            pluginDir: pluginDir,
            bundleResourceURL: bundleDir
        )

        #expect(FileManager.default.fileExists(atPath: pluginDir.path))
    }

    // MARK: - Bundle copy

    @Test func copiesBundledFileWhenDestinationAbsent() throws {
        let tmp = try makeTempDir()
        let pluginDir = tmp.appendingPathComponent("Plugins")
        let bundleDir = tmp.appendingPathComponent("Bundle")
        try FileManager.default.createDirectory(at: bundleDir, withIntermediateDirectories: true)

        let filename = "markup-editor-markdown.js"
        _ = try writeBundleFile(named: filename, in: bundleDir)

        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: filename)]
        PluginSetup.setupPluginDirectory(
            entries: entries,
            pluginDir: pluginDir,
            bundleResourceURL: bundleDir
        )

        let dest = pluginDir.appendingPathComponent(filename)
        #expect(FileManager.default.fileExists(atPath: dest.path))
    }

    @Test func overwritesExistingPluginFile() throws {
        let tmp = try makeTempDir()
        let pluginDir = tmp.appendingPathComponent("Plugins")
        try FileManager.default.createDirectory(at: pluginDir, withIntermediateDirectories: true)
        let bundleDir = tmp.appendingPathComponent("Bundle")
        try FileManager.default.createDirectory(at: bundleDir, withIntermediateDirectories: true)

        let filename = "markup-editor-markdown.js"
        // Pre-existing file that should be replaced by the bundled version
        let existingContent = "// old version"
        let destURL = pluginDir.appendingPathComponent(filename)
        try existingContent.write(to: destURL, atomically: true, encoding: .utf8)

        // Bundle has a newer version
        let bundleURL = try writeBundleFile(named: filename, in: bundleDir)
        let bundleContent = try String(contentsOf: bundleURL, encoding: .utf8)

        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: filename)]
        PluginSetup.setupPluginDirectory(
            entries: entries,
            pluginDir: pluginDir,
            bundleResourceURL: bundleDir
        )

        let content = try String(contentsOf: destURL, encoding: .utf8)
        #expect(content == bundleContent)
    }

    // MARK: - Missing bundle file

    @Test func skipsGracefullyWhenBundleFileMissing() throws {
        let tmp = try makeTempDir()
        let pluginDir = tmp.appendingPathComponent("Plugins")
        let bundleDir = tmp.appendingPathComponent("Bundle")
        try FileManager.default.createDirectory(at: bundleDir, withIntermediateDirectories: true)

        let filename = "markup-editor-markdown.js"
        // Bundle directory exists but file is NOT present

        let entries = [AppConfig.PluginConfigEntry(name: "Markdown", filename: filename)]
        // Must not throw or crash
        PluginSetup.setupPluginDirectory(
            entries: entries,
            pluginDir: pluginDir,
            bundleResourceURL: bundleDir
        )

        // Plugin directory should still have been created
        #expect(FileManager.default.fileExists(atPath: pluginDir.path))
        // Destination should NOT exist (nothing to copy from)
        let dest = pluginDir.appendingPathComponent(filename)
        #expect(!FileManager.default.fileExists(atPath: dest.path))
    }

    // MARK: - Empty entries

    @Test func emptyEntriesIsNoOp() throws {
        let tmp = try makeTempDir()
        let pluginDir = tmp.appendingPathComponent("Plugins")
        let bundleDir = tmp.appendingPathComponent("Bundle")
        try FileManager.default.createDirectory(at: bundleDir, withIntermediateDirectories: true)

        PluginSetup.setupPluginDirectory(
            entries: [],
            pluginDir: pluginDir,
            bundleResourceURL: bundleDir
        )

        // Directory is created, but no files
        #expect(FileManager.default.fileExists(atPath: pluginDir.path))
        let contents = try FileManager.default.contentsOfDirectory(atPath: pluginDir.path)
        #expect(contents.isEmpty)
    }

}
