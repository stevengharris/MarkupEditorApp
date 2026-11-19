//
//  ShortcutsProcess.swift
//  MarkupEditorAppLib
//

import Foundation
import Synchronization

/// Runs the `shortcuts` command-line tool and returns its standard output.
public enum ShortcutsProcess {

    public static let defaultExecutable = URL(fileURLWithPath: "/usr/bin/shortcuts")

    /// Runs off the calling actor. The process is stopped when it has not finished within `timeout`.
    public static func run(executable: URL = defaultExecutable, arguments: [String], timeout: Duration = .seconds(10)) async throws -> String {
        try await withCheckedThrowingContinuation { continuation in
            DispatchQueue.global(qos: .userInitiated).async {
                continuation.resume(with: Result { try runBlocking(executable: executable, arguments: arguments, timeout: timeout) })
            }
        }
    }

    private static func runBlocking(executable: URL, arguments: [String], timeout: Duration) throws -> String {
        let process = Process()
        process.executableURL = executable
        process.arguments = arguments
        process.standardInput = FileHandle.nullDevice
        let output = Pipe()
        let errors = Pipe()
        process.standardOutput = output
        process.standardError = errors
        do {
            try process.run()
        } catch {
            throw ShortcutsError.launchFailed(error.localizedDescription)
        }

        let timedOut = Mutex(false)
        let seconds = Double(timeout.components.seconds) + Double(timeout.components.attoseconds) / 1e18
        let timer = DispatchWorkItem {
            timedOut.withLock { $0 = true }
            if process.isRunning { process.terminate() }
        }
        DispatchQueue.global().asyncAfter(deadline: .now() + seconds, execute: timer)

        // Both pipes are drained while the process runs, so output larger than a pipe buffer cannot stall it.
        let errorData = Mutex(Data())
        let drained = DispatchGroup()
        drained.enter()
        DispatchQueue.global().async {
            let data = errors.fileHandleForReading.readDataToEndOfFile()
            errorData.withLock { $0 = data }
            drained.leave()
        }
        let outputData = output.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        drained.wait()
        timer.cancel()

        if timedOut.withLock({ $0 }) { throw ShortcutsError.timedOut }
        guard process.terminationStatus == 0 else {
            let message = String(data: errorData.withLock { $0 }, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            throw ShortcutsError.failed(status: process.terminationStatus, message: message)
        }
        return String(data: outputData, encoding: .utf8) ?? ""
    }
}
