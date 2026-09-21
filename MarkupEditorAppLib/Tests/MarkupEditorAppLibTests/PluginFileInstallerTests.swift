//
//  PluginFileInstallerTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
import MarkupEditor
@testable import MarkupEditorAppLib

/// Each test works in its own temporary directory, so none touches the real plugin directories.
private func makeTempDir() throws -> URL {
    let dir = FileManager.default.temporaryDirectory.appendingPathComponent("PluginFileInstallerTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir
}

private func write(_ text: String, to url: URL) throws {
    try text.write(to: url, atomically: true, encoding: .utf8)
}

private func read(_ url: URL) throws -> String {
    try String(contentsOf: url, encoding: .utf8)
}

struct PluginFileInstallerTests {

    @Test func copiesANewFile() throws {
        let dir = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let source = dir.appendingPathComponent("source/plugin.js")
        try FileManager.default.createDirectory(at: source.deletingLastPathComponent(), withIntermediateDirectories: true)
        try write("v1", to: source)
        let destination = dir.appendingPathComponent("installed/plugin.js")
        try FileManager.default.createDirectory(at: destination.deletingLastPathComponent(), withIntermediateDirectories: true)

        try PluginFileInstaller.install(source: source, destination: destination)

        #expect(try read(destination) == "v1")
    }

    @Test func replacesAnInstalledFileAndLeavesNoStagingFileBehind() throws {
        let dir = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let source = dir.appendingPathComponent("plugin.js")
        try write("v2", to: source)
        let installed = dir.appendingPathComponent("installed", isDirectory: true)
        try FileManager.default.createDirectory(at: installed, withIntermediateDirectories: true)
        let destination = installed.appendingPathComponent("plugin.js")
        try write("v1", to: destination)

        try PluginFileInstaller.install(source: source, destination: destination)

        #expect(try read(destination) == "v2")
        #expect(try FileManager.default.contentsOfDirectory(atPath: installed.path(percentEncoded: false)) == ["plugin.js"])
    }

    @Test func leavesTheInstalledFileIntactWhenTheCopyFails() throws {
        let dir = try makeTempDir()
        let source = dir.appendingPathComponent("plugin.js")
        defer {
            try? FileManager.default.setAttributes([.posixPermissions: 0o644], ofItemAtPath: source.path(percentEncoded: false))
            try? FileManager.default.removeItem(at: dir)
        }
        try write("v2", to: source)
        let installed = dir.appendingPathComponent("installed", isDirectory: true)
        try FileManager.default.createDirectory(at: installed, withIntermediateDirectories: true)
        let destination = installed.appendingPathComponent("plugin.js")
        try write("v1", to: destination)
        // An unreadable source fails the copy itself, after a destination deleted up front would
        // already be gone.
        try FileManager.default.setAttributes([.posixPermissions: 0o000], ofItemAtPath: source.path(percentEncoded: false))

        #expect(throws: PluginInstallError.self) { try PluginFileInstaller.install(source: source, destination: destination) }

        #expect(try read(destination) == "v1")
        #expect(try FileManager.default.contentsOfDirectory(atPath: installed.path(percentEncoded: false)) == ["plugin.js"])
    }

    @Test func leavesAFileAloneWhenTheSourceIsTheInstalledCopy() throws {
        let dir = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let file = dir.appendingPathComponent("plugin.js")
        try write("v1", to: file)

        try PluginFileInstaller.install(source: file, destination: file)
        #expect(try read(file) == "v1")

        // The same file reached through a path with a redundant component.
        try FileManager.default.createDirectory(at: dir.appendingPathComponent("sub"), withIntermediateDirectories: true)
        let indirect = dir.appendingPathComponent("sub/../plugin.js")
        try PluginFileInstaller.install(source: indirect, destination: file)
        #expect(try read(file) == "v1")
    }

    @Test func reportsAMissingSourceAndTouchesNothing() throws {
        let dir = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let destination = dir.appendingPathComponent("plugin.js")
        try write("v1", to: destination)

        #expect(throws: PluginInstallError.sourceNotFound("gone.js")) {
            try PluginFileInstaller.install(source: dir.appendingPathComponent("gone.js"), destination: destination)
        }
        #expect(try read(destination) == "v1")
    }

    @Test func errorsDescribeThemselvesForTheUser() {
        #expect(PluginInstallError.sourceNotFound("a.js").errorDescription?.contains("a.js") == true)
        #expect(PluginInstallError.copyFailed(filename: "a.js", reason: "disk full").errorDescription?.contains("disk full") == true)
        #expect(PluginInstallError.protectedName("Metadata").errorDescription?.contains("Metadata") == true)
    }
}

struct ManagerInstallTests {

    private let cacheDir = FileManager.default.temporaryDirectory.appendingPathComponent("ManagerInstallTests-cache-\(UUID().uuidString)", isDirectory: true)

    private func stage(_ text: String, named filename: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("ManagerInstallTests-\(UUID().uuidString)-\(filename)")
        try write(text, to: url)
        return url
    }

    @Test func exporterInstallCopiesTheFileAndRecordsThePlugin() throws {
        let filename = "exporter-installtest-\(UUID().uuidString).js"
        let source = try stage("v1", named: filename)
        try FileManager.default.createDirectory(at: ExporterManager.defaultDir, withIntermediateDirectories: true)
        let installed = ExporterManager.defaultDir.appendingPathComponent(source.lastPathComponent)
        defer { try? FileManager.default.removeItem(at: installed); try? FileManager.default.removeItem(at: cacheDir) }

        let updated = try ExporterManager.install(name: "InstallTest", url: source, ext: "it", exporters: [], codeViews: [], cacheDir: cacheDir)

        #expect(updated == [Plugin(name: "InstallTest", type: "exporter", filename: source.lastPathComponent, ext: "it")])
        #expect(try read(installed) == "v1")
    }

    @Test func exporterInstallReportsAMissingSourceInsteadOfSilentlyReturningTheOldList() {
        let missing = FileManager.default.temporaryDirectory.appendingPathComponent("missing-\(UUID().uuidString).js")
        #expect(throws: PluginInstallError.sourceNotFound(missing.lastPathComponent)) {
            try ExporterManager.install(name: "InstallTest", url: missing, ext: "it", exporters: [], codeViews: [], cacheDir: cacheDir)
        }
    }

    @Test func exporterAddStillReturnsTheListUnchangedOnFailure() {
        let missing = FileManager.default.temporaryDirectory.appendingPathComponent("missing-\(UUID().uuidString).js")
        let existing = [Plugin(name: "Existing", type: "exporter", filename: "e.js", ext: "e")]
        #expect(ExporterManager.add(name: "InstallTest", url: missing, ext: "it", exporters: existing, codeViews: [], cacheDir: cacheDir) == existing)
    }

    @Test func codeViewInstallCopiesTheFileAndRecordsThePlugin() throws {
        let filename = "codeview-installtest-\(UUID().uuidString).js"
        let source = try stage("v1", named: filename)
        try FileManager.default.createDirectory(at: CodeViewManager.defaultDir, withIntermediateDirectories: true)
        let installed = CodeViewManager.defaultDir.appendingPathComponent(source.lastPathComponent)
        defer { try? FileManager.default.removeItem(at: installed); try? FileManager.default.removeItem(at: cacheDir) }

        let updated = try CodeViewManager.install(name: "InstallTestView", url: source, exporters: [], codeViews: [], cacheDir: cacheDir)

        #expect(updated == [Plugin(name: "InstallTestView", type: "codeview", filename: source.lastPathComponent)])
        #expect(try read(installed) == "v1")
    }

    @Test func codeViewInstallRefusesAProtectedNameWithoutTouchingAnyFile() throws {
        let source = try stage("v1", named: "codeview-protected.js")
        defer { try? FileManager.default.removeItem(at: source) }
        #expect(throws: PluginInstallError.protectedName("Metadata")) {
            try CodeViewManager.install(name: "Metadata", url: source, exporters: [], codeViews: [], cacheDir: cacheDir)
        }
    }
}
