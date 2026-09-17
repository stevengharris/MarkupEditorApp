//
//  FileChangeWatcher.swift
//  MarkupEditorApp
//

import Foundation

/// Watches a single file path for external changes and yields the file's current URL once per
/// detected change -- usually the watched path itself, but a different URL when the file was
/// renamed to a new name (see `.rename` handling below).
///
/// An editor that saves via atomic replace (temp file + rename, e.g. Xcode, and Foundation's
/// `atomically: true` writes) leaves the originally-opened file descriptor pointing at a
/// now-unlinked inode after the rename. `.rename`/`.delete` are watched alongside `.write` so
/// that case is caught too, closing and reopening the descriptor at the same path rather than
/// going silent after the first external save.
///
/// A `.rename` event is ambiguous: it fires identically for "atomic replace at the same name"
/// (a new file just landed at `path`) and "the file itself was renamed elsewhere" (e.g. in
/// Finder -- nothing will ever reappear at `path`). The two need different responses (reopen
/// `path` vs. follow the file to its new name), so `.rename` resolves the still-open
/// descriptor's current path via `fcntl(F_GETPATH)`, which follows the inode regardless of what
/// it's now named, to tell them apart.
final class FileChangeWatcher: @unchecked Sendable {
    // `onTermination` runs in a nonisolated context, so `stop()` and the state it touches must
    // be reachable without main-actor isolation. Every mutation happens on DispatchQueue.main
    // (start/restart already schedule there; stop() hops onto it explicitly since onTermination
    // can run on an arbitrary thread), so there's one serializing queue behind the
    // `nonisolated(unsafe)`, not an actual data race.
    private nonisolated(unsafe) var source: DispatchSourceFileSystemObject?
    private nonisolated(unsafe) var fileDescriptor: CInt = -1
    // Set by stop() so a retry/restart timer scheduled before stop() but firing after doesn't
    // resurrect a dead watcher. Without this, a pending timer silently reopens a new
    // DispatchSourceFileSystemObject that nothing will ever cancel again -- a real leak, not
    // just a hypothetical.
    private nonisolated(unsafe) var isStopped = false
    private let path: String
    private let continuation: AsyncStream<URL>.Continuation

    private nonisolated init(path: String, continuation: AsyncStream<URL>.Continuation) {
        self.path = path
        self.continuation = continuation
    }

    /// Starts watching `path` and returns a stream that yields the file's current URL once per
    /// detected external change. Watching stops and the underlying file descriptor is closed
    /// when the stream's consumer stops iterating (e.g. a SwiftUI `.task` being cancelled), or
    /// when the watched file is found to have been renamed elsewhere -- the caller starts a
    /// fresh watch on the yielded URL to keep following the file.
    nonisolated static func watch(path: String) -> AsyncStream<URL> {
        AsyncStream { continuation in
            let watcher = FileChangeWatcher(path: path, continuation: continuation)
            watcher.start()
            continuation.onTermination = { _ in watcher.stop() }
        }
    }

    /// `retriesRemaining` covers the case where watching starts for a path that doesn't exist
    /// on disk yet -- e.g. Save As, where the caller's `.task(id:)` can restart watching for
    /// the new URL before the actual write completes (they're separated by several `await`s).
    /// Without this, that race would silently and permanently stop watching that document.
    private nonisolated func start(retriesRemaining: Int = 10) {
        guard !isStopped else { return }
        let fd = open(path, O_EVTONLY)
        guard fd >= 0 else {
            guard retriesRemaining > 0 else { return }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
                self?.start(retriesRemaining: retriesRemaining - 1)
            }
            return
        }
        fileDescriptor = fd
        let source = DispatchSource.makeFileSystemObjectSource(
            fileDescriptor: fd,
            eventMask: [.write, .rename, .delete],
            queue: .main
        )
        source.setEventHandler { [weak self] in
            guard let self else { return }
            let flags = source.data
            if flags.contains(.rename) {
                self.handleRename()
            } else if flags.contains(.delete) {
                self.continuation.yield(URL(fileURLWithPath: self.path))
                self.restart()
            } else {
                self.continuation.yield(URL(fileURLWithPath: self.path))
            }
        }
        source.setCancelHandler { [weak self] in
            guard let self, self.fileDescriptor >= 0 else { return }
            close(self.fileDescriptor)
            self.fileDescriptor = -1
        }
        self.source = source
        source.resume()
    }

    /// Resolves the still-open descriptor's current path to tell which of the two things a
    /// `.rename` event can mean:
    /// - a different, existing path: the file was renamed (e.g. in Finder) -- yield the new
    ///   location and end the stream; the caller follows it with a fresh watch.
    /// - anything else (same path, or resolution failed): an atomic-replace save landed a new
    ///   file at the same name -- reopen `path` as before.
    private nonisolated func handleRename() {
        let resolvedPath = currentPath()
        if resolvedPath != path, FileManager.default.fileExists(atPath: resolvedPath) {
            continuation.yield(URL(fileURLWithPath: resolvedPath))
            continuation.finish()
            stop()
            return
        }
        continuation.yield(URL(fileURLWithPath: path))
        restart()
    }

    /// The current path of the still-open `fileDescriptor`, per the kernel's bookkeeping --
    /// unlike `path`, this follows the file to wherever it's now named. Falls back to `path` if
    /// resolution fails (e.g. descriptor closed), so an unresolvable rename is treated as
    /// "reopen the same name" rather than risking a bogus "moved" report.
    private nonisolated func currentPath() -> String {
        guard fileDescriptor >= 0 else { return path }
        var buf = [CChar](repeating: 0, count: Int(MAXPATHLEN))
        guard fcntl(fileDescriptor, F_GETPATH, &buf) != -1 else { return path }
        let nullTerminatorIndex = buf.firstIndex(of: 0) ?? buf.count
        let bytes = buf[..<nullTerminatorIndex].map { UInt8(bitPattern: $0) }
        return String(decoding: bytes, as: UTF8.self)
    }

    /// Re-opens the file descriptor at the same path after an atomic-replace save. A short
    /// delay gives the replacing writer time to finish the rename before reopening; reopening
    /// immediately can race the write and briefly re-attach to a file that's about to disappear.
    private nonisolated func restart() {
        source?.cancel()
        source = nil
        guard !isStopped else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) { [weak self] in
            self?.start()
        }
    }

    /// Hops onto DispatchQueue.main since onTermination (the only caller) can run on an
    /// arbitrary thread, but every other mutation of this state happens on .main already.
    private nonisolated func stop() {
        DispatchQueue.main.async { [self] in
            isStopped = true
            source?.cancel()
            source = nil
        }
    }
}
