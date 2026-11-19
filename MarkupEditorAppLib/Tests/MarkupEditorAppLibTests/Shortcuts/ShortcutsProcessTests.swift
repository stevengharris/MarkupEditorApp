//
//  ShortcutsProcessTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct ShortcutsProcessTests {

    private func run(_ path: String, _ arguments: [String], timeout: Duration = .seconds(5)) async throws -> String {
        try await ShortcutsProcess.run(executable: URL(fileURLWithPath: path), arguments: arguments, timeout: timeout)
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
}
