//
//  ShortcutsProcessTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct ShortcutsProcessTests {

    private func run(_ path: String, _ arguments: [String], timeout: Duration = .seconds(5),
                     killGrace: Duration = .milliseconds(300), drainGrace: Duration = .milliseconds(300)) async throws -> String {
        try await ShortcutsProcess.run(executable: URL(fileURLWithPath: path), arguments: arguments, timeout: timeout,
                                       killGrace: killGrace, drainGrace: drainGrace)
    }

    @Test func itReturnsStandardOutput() async throws {
        #expect(try await run("/bin/echo", ["one two"]) == "one two\n")
    }

    @Test func aNonZeroStatusThrowsWithItsStatusAndTheErrorText() async {
        do {
            _ = try await run("/bin/sh", ["-c", "echo oops >&2; exit 3"])
            Issue.record("expected a failure")
        } catch let error as ShortcutsError {
            #expect(error == .failed(status: 3, message: "oops"))
        } catch {
            Issue.record("unexpected error \(error)")
        }
    }

    @Test func aProcessThatRunsTooLongIsStoppedAndReportsATimeout() async {
        let started = Date()
        do {
            _ = try await run("/bin/sleep", ["5"], timeout: .milliseconds(200))
            Issue.record("expected a timeout")
        } catch let error as ShortcutsError {
            #expect(error == .timedOut)
        } catch {
            Issue.record("unexpected error \(error)")
        }
        #expect(Date().timeIntervalSince(started) < 3)
    }

    @Test func aMissingProgramIsALaunchFailure() async {
        do {
            _ = try await run("/nonexistent/shortcuts", [])
            Issue.record("expected a failure")
        } catch let error as ShortcutsError {
            guard case .launchFailed = error else { Issue.record("expected launchFailed, got \(error)"); return }
        } catch {
            Issue.record("unexpected error \(error)")
        }
    }

    @Test func outputLargerThanAPipeBufferIsReadInFull() async throws {
        let output = try await run("/usr/bin/head", ["-c", "300000", "/dev/zero"])
        #expect(output.utf8.count == 300_000)
    }

    @Test func aProcessThatIgnoresTerminateIsKilledAfterTheGrace() async throws {
        let pidFile = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutsProcessTests-\(UUID().uuidString).pid")
        defer { try? FileManager.default.removeItem(at: pidFile) }
        do {
            _ = try await run("/bin/sh", ["-c", "echo $$ > '\(pidFile.path)'; trap '' TERM; while true; do sleep 1; done"], timeout: .milliseconds(400))
            Issue.record("expected a timeout")
        } catch let error as ShortcutsError {
            #expect(error == .timedOut)
        } catch {
            Issue.record("unexpected error \(error)")
        }
        let pid = try #require(Int32(String(contentsOf: pidFile, encoding: .utf8).trimmingCharacters(in: .whitespacesAndNewlines)))
        try await Task.sleep(for: .milliseconds(300))
        let alive = kill(pid, 0) == 0
        if alive { kill(pid, SIGKILL) }
        #expect(!alive)
    }

    @Test func aChildHoldingThePipeOpenDoesNotKeepTheCallWaiting() async throws {
        let started = Date()
        let output = try await run("/bin/sh", ["-c", "sleep 20 & echo started"])
        #expect(output == "started\n")
        #expect(Date().timeIntervalSince(started) < 4)
    }

    @Test func cancellingTheTaskStopsTheProcessAndThrowsCancellation() async {
        let started = Date()
        let task = Task { try await run("/bin/sleep", ["20"], timeout: .seconds(30)) }
        try? await Task.sleep(for: .milliseconds(200))
        task.cancel()
        do {
            _ = try await task.value
            Issue.record("expected cancellation")
        } catch is CancellationError {
        } catch {
            Issue.record("unexpected error \(error)")
        }
        #expect(Date().timeIntervalSince(started) < 4)
    }

    @Test func aRunThatFinishesInTimeIsNeverReportedAsATimeout() async throws {
        for _ in 0..<20 {
            #expect(try await run("/bin/echo", ["ok"], timeout: .milliseconds(500)) == "ok\n")
        }
    }
}
