//
//  SocketWatchTests.swift
//  MarkupEditorMCPTests
//

import Foundation
import Testing
@testable import MarkupEditorMCP

struct SocketWatchTests {

    private func folder() throws -> URL {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("watch-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
        return folder
    }

    /// True when `waitForChange` returned before `limit`.
    private func changed(_ watch: SocketWatch, within limit: Duration = .seconds(5)) async -> Bool {
        let clock = ContinuousClock()
        let start = clock.now
        await watch.waitForChange(timeout: limit)
        return clock.now - start < limit
    }

    @Test func creatingTheFileWakesTheWait() async throws {
        let folder = try folder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let path = folder.appendingPathComponent("mcp.sock").path
        let watch = SocketWatch(path: path)
        #expect(watch.isWatching)
        #expect(!watch.exists)
        Task {
            try? await Task.sleep(for: .milliseconds(50))
            FileManager.default.createFile(atPath: path, contents: nil)
        }
        #expect(await changed(watch))
        #expect(watch.exists)
    }

    @Test func removingTheFileWakesTheWait() async throws {
        let folder = try folder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let path = folder.appendingPathComponent("mcp.sock").path
        FileManager.default.createFile(atPath: path, contents: nil)
        let watch = SocketWatch(path: path)
        Task {
            try? await Task.sleep(for: .milliseconds(50))
            try? FileManager.default.removeItem(atPath: path)
        }
        #expect(await changed(watch))
        #expect(!watch.exists)
    }

    @Test func aChangeBeforeTheWaitIsNotLost() async throws {
        let folder = try folder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let path = folder.appendingPathComponent("mcp.sock").path
        let watch = SocketWatch(path: path)
        FileManager.default.createFile(atPath: path, contents: nil)
        try await Task.sleep(for: .milliseconds(200))
        #expect(await changed(watch))
    }

    @Test func otherFilesInTheFolderDoNotWakeTheWait() async throws {
        let folder = try folder()
        defer { try? FileManager.default.removeItem(at: folder) }
        let watch = SocketWatch(path: folder.appendingPathComponent("mcp.sock").path)
        Task {
            try? await Task.sleep(for: .milliseconds(50))
            FileManager.default.createFile(atPath: folder.appendingPathComponent("other").path, contents: nil)
        }
        #expect(await !changed(watch, within: .milliseconds(400)))
    }

    @Test func aMissingFolderCannotBeWatched() {
        let watch = SocketWatch(path: "/nonexistent-\(UUID().uuidString)/mcp.sock")
        #expect(!watch.isWatching)
        #expect(!watch.exists)
    }
}
