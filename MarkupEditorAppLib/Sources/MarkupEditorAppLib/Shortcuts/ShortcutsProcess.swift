//
//  ShortcutsProcess.swift
//  MarkupEditorAppLib
//

import Foundation
import Synchronization

/// Runs the `shortcuts` command-line tool and returns its standard output.
public enum ShortcutsProcess {

    public static let defaultExecutable = URL(fileURLWithPath: "/usr/bin/shortcuts")

    /// Bytes read from one pipe, appended from a read handler and taken once the process is done.
    private final class Collected: @unchecked Sendable {
        private let data = Mutex(Data())

        func append(_ chunk: Data) { data.withLock { $0.append(chunk) } }
        var value: Data { data.withLock { $0 } }
    }

    /// One launch of the tool, shared between the blocking worker and the cancellation handler.
    private final class Launch: @unchecked Sendable {
        let process = Process()
        private let cancelled = Mutex(false)

        func markCancelled() { cancelled.withLock { $0 = true } }
        var isCancelled: Bool { cancelled.withLock { $0 } }
    }

    /// Runs off the calling actor. The process is terminated when it has not finished within `timeout` and
    /// killed `killGrace` later if it is still running; output is collected for at most `drainGrace` after
    /// it exits. Cancelling the task stops the process and throws `CancellationError`.
    public static func run(executable: URL = defaultExecutable, arguments: [String], timeout: Duration = .seconds(10),
                           killGrace: Duration = .seconds(2), drainGrace: Duration = .seconds(1)) async throws -> String {
        let launch = Launch()
        return try await withTaskCancellationHandler {
            try await withCheckedThrowingContinuation { continuation in
                // The worker blocks on a semaphore and a group that the process's termination and read handlers
                // signal from default-priority threads. A dispatched block takes the caller's higher priority unless
                // it is enforced, and would then wait on lower-priority threads.
                let work = DispatchWorkItem(qos: .default, flags: .enforceQoS) {
                    continuation.resume(with: Result {
                        try runBlocking(launch: launch, executable: executable, arguments: arguments,
                                        timeout: timeout, killGrace: killGrace, drainGrace: drainGrace)
                    })
                }
                DispatchQueue.global(qos: .default).async(execute: work)
            }
        } onCancel: {
            launch.markCancelled()
            stop(launch.process, killGrace: killGrace)
        }
    }

    private static func seconds(_ duration: Duration) -> Double {
        Double(duration.components.seconds) + Double(duration.components.attoseconds) / 1e18
    }

    /// Terminates `process`, then kills it after `killGrace` if it is still running.
    private static func stop(_ process: Process, killGrace: Duration) {
        guard process.isRunning else { return }
        process.terminate()
        DispatchQueue.global().asyncAfter(deadline: .now() + seconds(killGrace)) {
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
        }
    }

    private static func runBlocking(launch: Launch, executable: URL, arguments: [String], timeout: Duration,
                                    killGrace: Duration, drainGrace: Duration) throws -> String {
        let process = launch.process
        process.executableURL = executable
        process.arguments = arguments
        process.standardInput = FileHandle.nullDevice
        let output = Pipe()
        let errors = Pipe()
        process.standardOutput = output
        process.standardError = errors

        let finished = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in finished.signal() }

        // Both pipes are drained while the process runs, so output larger than a pipe buffer cannot stall it.
        let outputData = Collected()
        let errorData = Collected()
        let drained = DispatchGroup()
        func drain(_ pipe: Pipe, into data: Collected) {
            drained.enter()
            pipe.fileHandleForReading.readabilityHandler = { handle in
                let chunk = handle.availableData
                if chunk.isEmpty {
                    handle.readabilityHandler = nil
                    drained.leave()
                } else {
                    data.append(chunk)
                }
            }
        }
        drain(output, into: outputData)
        drain(errors, into: errorData)

        do {
            try process.run()
        } catch {
            output.fileHandleForReading.readabilityHandler = nil
            errors.fileHandleForReading.readabilityHandler = nil
            throw ShortcutsError.launchFailed(error.localizedDescription)
        }
        if launch.isCancelled { stop(process, killGrace: killGrace) }

        var timedOut = false
        if finished.wait(timeout: .now() + seconds(timeout)) == .timedOut {
            timedOut = true
            stop(process, killGrace: killGrace)
            _ = finished.wait(timeout: .now() + seconds(killGrace) + 1)
        }
        // A child that keeps a pipe open must not keep this call waiting once the process is gone.
        _ = drained.wait(timeout: .now() + seconds(drainGrace))
        output.fileHandleForReading.readabilityHandler = nil
        errors.fileHandleForReading.readabilityHandler = nil

        if launch.isCancelled { throw CancellationError() }
        if timedOut { throw ShortcutsError.timedOut }
        guard process.terminationStatus == 0 else {
            let message = String(data: errorData.value, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            throw ShortcutsError.failed(status: process.terminationStatus, message: message)
        }
        return String(data: outputData.value, encoding: .utf8) ?? ""
    }
}
