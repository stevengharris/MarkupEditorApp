//
//  ShortcutRunStore.swift
//  MarkupEditorAppLib
//

import Foundation
import Observation

/// What `ShortcutRunStore.begin` hands the caller for one run.
public struct ShortcutRunTicket: Sendable {
    public let id: UUID
    public let shortcutName: String
    let store: ShortcutRunStore
    let run: ShortcutRunStore.Run

    /// Waits for the run to end. Cancelling the waiting task ends the run as cancelled.
    @MainActor
    public func result() async -> ShortcutOutcome {
        if let outcome = run.outcome { return outcome }
        let store = store
        let id = id
        return await withTaskCancellationHandler {
            await withCheckedContinuation { continuation in
                if let outcome = run.outcome {
                    continuation.resume(returning: outcome)
                } else {
                    run.waiter = continuation
                }
            }
        } onCancel: {
            Task { @MainActor in store.complete(id, with: .cancelled) }
        }
    }
}

/// The runs in flight. It only completes tickets: it never starts, opens or saves anything.
@MainActor @Observable
public final class ShortcutRunStore {

    public static let shared = ShortcutRunStore()

    /// How long a run may go unanswered before it ends as `.noResponse`.
    public nonisolated static let timeout: Duration = .seconds(120)

    /// Names of the Shortcuts with a run in flight; at most one.
    public private(set) var runningNames: Set<String> = []

    @MainActor
    final class Run {
        let id = UUID()
        let shortcutName: String
        var outcome: ShortcutOutcome?
        var waiter: CheckedContinuation<ShortcutOutcome, Never>?
        var timeoutTask: Task<Void, Never>?
        init(shortcutName: String) { self.shortcutName = shortcutName }
    }

    @ObservationIgnored private var runs: [UUID: Run] = [:]
    /// Runs that ended without a callback (cancelled or timed out), so that Shortcuts answering later is expected.
    @ObservationIgnored private var endedWithoutCallback: [UUID] = []
    private static let endedMemory = 50
    @ObservationIgnored private let limit: Duration
    @ObservationIgnored private let sleeper: @Sendable (Duration) async throws -> Void

    /// `sleeper` stands in for the wait before the timeout, so tests do not wait.
    public init(timeout: Duration = ShortcutRunStore.timeout,
                sleeper: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) }) {
        limit = timeout
        self.sleeper = sleeper
    }

    public func isRunning(_ shortcutName: String) -> Bool {
        runningNames.contains(shortcutName)
    }

    /// Whether any run is in flight. Shortcuts abandons the callbacks of a run when another starts, so
    /// only one run goes at a time.
    public var isBusy: Bool { !runningNames.isEmpty }

    /// A ticket for a new run of `shortcutName`, or nil while any run is in flight.
    public func begin(shortcutName: String) -> ShortcutRunTicket? {
        guard runningNames.isEmpty else { return nil }
        let run = Run(shortcutName: shortcutName)
        runs[run.id] = run
        runningNames.insert(shortcutName)
        let limit = limit
        let sleeper = sleeper
        run.timeoutTask = Task { [weak self] in
            do { try await sleeper(limit) } catch { return }
            guard !Task.isCancelled else { return }
            self?.complete(run.id, with: .noResponse)
        }
        return ShortcutRunTicket(id: run.id, shortcutName: shortcutName, store: self, run: run)
    }

    /// Completes the run a callback URL names. A malformed URL, or an unknown or repeated id, is dropped
    /// with a warning that does not repeat the URL. An answer for a run that was cancelled or timed out
    /// is dropped without one.
    public func receive(_ url: URL) {
        guard let parsed = ShortcutCallbackURL.parse(url) else {
            EditLog.shared.warning("Ignored a malformed Shortcut result.", category: "Shortcuts")
            return
        }
        let outcome: ShortcutOutcome = switch parsed.callback {
        case .success(let result): ShortcutStatus.outcome(forResult: result)
        case .error(let message): .shortcutError(message)
        case .cancel: .cancelled
        }
        if !complete(parsed.id, with: outcome, fromCallback: true), !endedWithoutCallback.contains(parsed.id) {
            EditLog.shared.warning("Ignored a Shortcut result with an unknown or already used id.", category: "Shortcuts")
        }
    }

    /// Ends the run once. False when no run in flight has `id`.
    @discardableResult
    func complete(_ id: UUID, with outcome: ShortcutOutcome, fromCallback: Bool = false) -> Bool {
        guard let run = runs.removeValue(forKey: id) else { return false }
        if !fromCallback {
            endedWithoutCallback.append(id)
            if endedWithoutCallback.count > Self.endedMemory { endedWithoutCallback.removeFirst() }
        }
        run.outcome = outcome
        run.timeoutTask?.cancel()
        run.timeoutTask = nil
        runningNames.remove(run.shortcutName)
        run.waiter?.resume(returning: outcome)
        run.waiter = nil
        return true
    }
}
