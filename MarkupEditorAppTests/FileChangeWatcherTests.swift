//
//  FileChangeWatcherTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
@testable import MarkupEditorApp

private actor EventCollector {
    private(set) var count = 0
    func record() { count += 1 }
}

private actor URLCollector {
    private(set) var urls: [URL] = []
    private(set) var finished = false
    func record(_ url: URL) { urls.append(url) }
    func markFinished() { finished = true }
}

private func makeTempDir() throws -> URL {
    let url = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
}

// Serialized: every test drives a DispatchSourceFileSystemObject scheduled on the shared
// DispatchQueue.main and asserts against fixed wall-clock timing windows. Running concurrently
// with Swift Testing's default parallel execution contends for that same queue and can push
// timing past those windows -- reproduced directly (startsWatchingBeforePathExists() failed
// when run alongside the other two tests, passed identically in isolation).
@Suite(.serialized)
struct FileChangeWatcherTests {

    @Test func detectsInPlaceWriteAndSurvivesAtomicReplace() async throws {
        let dir = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let path = dir.appendingPathComponent("doc.txt").path(percentEncoded: false)
        try "initial".write(toFile: path, atomically: false, encoding: .utf8)

        let stream = FileChangeWatcher.watch(path: path)
        let collector = EventCollector()
        let consumeTask = Task {
            for await _ in stream { await collector.record() }
        }
        defer { consumeTask.cancel() }

        try await Task.sleep(for: .milliseconds(200)) // let the watcher arm before writing

        try "changed".write(toFile: path, atomically: false, encoding: .utf8)
        try await Task.sleep(for: .milliseconds(300))
        #expect(await collector.count >= 1)

        // Atomic replace (temp file + rename) -- what Xcode's save and Foundation's
        // `atomically: true` writes do. This invalidates the original file descriptor;
        // the watcher must detect the rename and reopen at the same path.
        try "replaced".write(toFile: path, atomically: true, encoding: .utf8)
        try await Task.sleep(for: .milliseconds(400)) // watcher's 0.1s restart delay + margin

        // A write AFTER the replace proves the watcher actually reopened and is still live --
        // not just that the replace's rename event was the last thing observed.
        try "after-replace".write(toFile: path, atomically: false, encoding: .utf8)
        try await Task.sleep(for: .milliseconds(300))
        #expect(await collector.count >= 3)
    }

    /// Renaming the watched file (e.g. in Finder) fires a `.rename` event just like an
    /// atomic-replace save. Without distinguishing the two, the watcher tries to reopen the
    /// now-gone original path, which surfaced to the user as a spurious "couldn't be opened
    /// because there is no such file" alert.
    @Test func followsRenameToNewPathAndFinishesStream() async throws {
        let dir = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let oldPath = dir.appendingPathComponent("old.md")
        let newPath = dir.appendingPathComponent("new.md")
        try "content".write(to: oldPath, atomically: false, encoding: .utf8)

        let stream = FileChangeWatcher.watch(path: oldPath.path(percentEncoded: false))
        let urlCollector = URLCollector()
        let consumeTask = Task {
            for await url in stream { await urlCollector.record(url) }
            await urlCollector.markFinished()
        }
        defer { consumeTask.cancel() }

        try await Task.sleep(for: .milliseconds(200))
        try FileManager.default.moveItem(at: oldPath, to: newPath) // like a Finder rename

        // Bounded wait for the stream to end on its own -- proves continuation.finish() (not
        // just the collector's assertions below) actually ran for this case.
        try await Task.sleep(for: .milliseconds(400))

        let urls = await urlCollector.urls
        #expect(urls.map(\.path) == [newPath.path])
        #expect(await urlCollector.finished)
    }

    @Test func stopsWatchingWhenConsumerStopsIterating() async throws {
        let dir = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let path = dir.appendingPathComponent("doc.txt").path(percentEncoded: false)
        try "initial".write(toFile: path, atomically: false, encoding: .utf8)

        let stream = FileChangeWatcher.watch(path: path)
        let collector = EventCollector()
        let consumeTask = Task {
            for await _ in stream {
                await collector.record()
                break // stop after the first event, like a cancelled SwiftUI .task would
            }
        }

        try await Task.sleep(for: .milliseconds(200))
        try "changed".write(toFile: path, atomically: false, encoding: .utf8)
        _ = await consumeTask.value
        #expect(await collector.count == 1)

        // No consumer left; further writes must not crash or leak a dangling source.
        try "changed-again".write(toFile: path, atomically: false, encoding: .utf8)
        try await Task.sleep(for: .milliseconds(200))
    }

    /// Covers the Save As race: MarkupDocumentView's `.task(id: document.url)` can start
    /// watching a new path before the file is actually written (they're separated by several
    /// `await`s in handleSave). Without start()'s retry, this would silently and permanently
    /// stop watching.
    ///
    /// Does not assert on an event from the file's *creation* write -- open() succeeding on a
    /// retry doesn't retroactively see a write that already completed before the descriptor
    /// existed. A naive version of this test asserted exactly that and only passed by racing
    /// the narrow gap between the creating write's create-then-write-data syscalls, failing
    /// intermittently when run alongside other tests but not in isolation. Waiting for the
    /// retry loop to catch up, then writing again, is deterministic instead.
    @Test func startsWatchingBeforePathExists() async throws {
        let dir = try makeTempDir()
        defer { try? FileManager.default.removeItem(at: dir) }
        let path = dir.appendingPathComponent("not-yet-created.txt").path(percentEncoded: false)

        let stream = FileChangeWatcher.watch(path: path) // path doesn't exist yet
        let collector = EventCollector()
        let consumeTask = Task {
            for await _ in stream { await collector.record() }
        }
        defer { consumeTask.cancel() }

        try await Task.sleep(for: .milliseconds(250)) // let a couple of retries fail while missing
        try "created".write(toFile: path, atomically: false, encoding: .utf8)
        try await Task.sleep(for: .milliseconds(500)) // let the retry loop catch up and open it

        try "changed-after-catch-up".write(toFile: path, atomically: false, encoding: .utf8)
        try await Task.sleep(for: .milliseconds(300))
        #expect(await collector.count >= 1)
    }
}
