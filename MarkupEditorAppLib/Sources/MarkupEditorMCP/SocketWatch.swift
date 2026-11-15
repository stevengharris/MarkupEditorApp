//
//  SocketWatch.swift
//  MarkupEditorMCP
//

import Foundation
import Synchronization

/// Reports when the file at `path` is created, removed or replaced, using a file-system event on its
/// folder, so waiting for the app to start listening costs no wake-ups.
final class SocketWatch: Sendable {

    private struct Identity: Equatable {
        var inode: UInt64
        var seconds: Int
        var nanoseconds: Int
    }

    private struct Waiting {
        var pending = false
        var waiter: CheckedContinuation<Void, Never>?
    }

    let path: String
    /// False when the folder cannot be watched, so the caller has to check on a timer instead.
    let isWatching: Bool
    private let source: DispatchSourceFileSystemObject?
    private let state = Mutex(Waiting())

    init(path: String) {
        self.path = path
        let folder = (path as NSString).deletingLastPathComponent
        let descriptor = open(folder, O_EVTONLY)
        guard descriptor >= 0 else {
            isWatching = false
            source = nil
            return
        }
        let source = DispatchSource.makeFileSystemObjectSource(fileDescriptor: descriptor, eventMask: .write, queue: .global(qos: .utility))
        source.setCancelHandler { close(descriptor) }
        isWatching = true
        self.source = source
        let last = Mutex(Self.identity(of: path))
        source.setEventHandler { [self] in
            let now = Self.identity(of: path)
            let changed = last.withLock { previous in
                defer { previous = now }
                return previous != now
            }
            if changed { fire() }
        }
        source.resume()
    }

    deinit {
        source?.cancel()
    }

    /// Whether anything is at the path now.
    var exists: Bool { Self.identity(of: path) != nil }

    private static func identity(of path: String) -> Identity? {
        var info = stat()
        guard lstat(path, &info) == 0 else { return nil }
        return Identity(inode: UInt64(info.st_ino), seconds: info.st_mtimespec.tv_sec, nanoseconds: info.st_mtimespec.tv_nsec)
    }

    private func fire() {
        let waiter = state.withLock { state -> CheckedContinuation<Void, Never>? in
            guard let waiter = state.waiter else {
                state.pending = true
                return nil
            }
            state.waiter = nil
            return waiter
        }
        waiter?.resume()
    }

    /// Returns when the file changes, at once if it changed since the last wait, or when `timeout` passes.
    /// A nil timeout waits for a change alone.
    func waitForChange(timeout: Duration?) async {
        await withTaskGroup(of: Void.self) { group in
            group.addTask { await self.nextChange() }
            if let timeout { group.addTask { try? await Task.sleep(for: timeout) } }
            await group.next()
            group.cancelAll()
        }
    }

    private func nextChange() async {
        await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                let resumeNow = state.withLock { state -> Bool in
                    if state.pending {
                        state.pending = false
                        return true
                    }
                    if Task.isCancelled { return true }
                    state.waiter = continuation
                    return false
                }
                if resumeNow { continuation.resume() }
            }
        } onCancel: {
            let waiter = state.withLock { state -> CheckedContinuation<Void, Never>? in
                defer { state.waiter = nil }
                return state.waiter
            }
            waiter?.resume()
        }
    }
}
