//
//  EditQueue.swift
//  MarkupEditorApp
//

import Foundation

/// Runs operations one at a time in the order they arrive, so each is checked against the document
/// as the one before left it. An operation's failure does not stop the ones behind it.
@MainActor
final class EditQueue {

    private var tail: Task<Void, Never> = Task {}

    /// Puts `operation` behind everything already queued. The position is fixed when this returns.
    func enqueue<T: Sendable>(_ operation: @escaping @MainActor () async throws -> T) -> Task<T, Error> {
        let previous = tail
        let task = Task { @MainActor in
            await previous.value
            return try await operation()
        }
        tail = Task { _ = await task.result }
        return task
    }

    func run<T: Sendable>(_ operation: @escaping @MainActor () async throws -> T) async throws -> T {
        try await enqueue(operation).value
    }
}
