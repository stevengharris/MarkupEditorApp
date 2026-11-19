//
//  RunShortcutModelTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

@MainActor
struct RunShortcutModelTests {

    private final class Gate: @unchecked Sendable {
        private let stream: AsyncStream<Void>
        private let continuation: AsyncStream<Void>.Continuation
        init() { (stream, continuation) = AsyncStream.makeStream() }
        func open() { continuation.yield(); continuation.finish() }
        func wait() async { for await _ in stream { return } }
    }

    private let report = ShortcutRunReport(outcome: .succeeded("hi\nexit=0"), summary: "succeeded", level: .info,
                                         output: "hi", fileURL: nil)

    private func model(_ gate: Gate, names: [String] = []) -> RunShortcutModel {
        let report = report
        return RunShortcutModel(shortcut: "Publish", documentName: "post.md") { name in
            await gate.wait()
            return ShortcutRunReport(outcome: report.outcome, summary: "ran \(name)", level: report.level,
                                   output: report.output, fileURL: nil)
        }
    }

    @Test func theWarningDependsOnWhetherTheDocumentHasAFileAndUnsavedChanges() {
        func model(_ name: String?, _ changed: Bool) -> RunShortcutModel {
            RunShortcutModel(shortcut: "A", documentName: name, hasUnsavedChanges: changed) { _ in
                ShortcutRunReport(outcome: .cancelled, summary: "", level: .info, output: nil, fileURL: nil)
            }
        }
        #expect(model("a.md", false).warning == nil)
        #expect(model("a.md", true).warning == "Warning: Unsaved changes. The Shortcut only has access to the saved file. Cancel and save if needed.")
        #expect(model(nil, false).warning == "Warning: This document has not been saved, so the Shortcut has no file. Cancel and save if needed.")
        #expect(model(nil, true).warning == model(nil, false).warning)
    }

    @Test func theModelRemembersWhetherTheDocumentHadUnsavedChanges() {
        #expect(RunShortcutModel(shortcut: "A", documentName: "a.md", hasUnsavedChanges: true) { _ in
            ShortcutRunReport(outcome: .cancelled, summary: "", level: .info, output: nil, fileURL: nil)
        }.hasUnsavedChanges)
        #expect(!RunShortcutModel(shortcut: "A", documentName: "a.md") { _ in
            ShortcutRunReport(outcome: .cancelled, summary: "", level: .info, output: nil, fileURL: nil)
        }.hasUnsavedChanges)
    }

    @Test func itStartsReady() {
        let m = model(Gate())
        #expect(m.state == .ready)
        #expect(m.shortcut == "Publish")
        #expect(m.documentName == "post.md")
    }

    @Test func runningMovesToRunningThenFinished() async {
        let gate = Gate()
        let m = model(gate)
        m.run()
        #expect(m.state == .running)
        gate.open()
        await m.finished()
        #expect(m.state == .finished(ShortcutRunReport(outcome: report.outcome, summary: "ran Publish", level: .info,
                                                     output: "hi", fileURL: nil)))
    }

    @Test func aSecondRunWhileRunningStartsNothing() async {
        let gate = Gate()
        let calls = Counter()
        let m = RunShortcutModel(shortcut: "A", documentName: nil) { _ in
            calls.count += 1
            await gate.wait()
            return ShortcutRunReport(outcome: .cancelled, summary: "cancelled", level: .info, output: nil, fileURL: nil)
        }
        m.run()
        m.run()
        gate.open()
        await m.finished()
        #expect(calls.count == 1)
    }

    @Test func aRunAfterItFinishedStartsNothing() async {
        let gate = Gate()
        let m = model(gate)
        m.run()
        gate.open()
        await m.finished()
        let before = m.state
        m.run()
        #expect(m.state == before)
    }

    @Test func aRunEndingAfterTheDialogIsGoneDoesNotCrash() async {
        let gate = Gate()
        var m: RunShortcutModel? = model(gate)
        m?.run()
        m = nil
        gate.open()
        for _ in 0..<50 { await Task.yield() }
        // Nothing holds the model but the run; ending it must not crash.
        #expect(m == nil)
    }

    @Test func cancellingARunningShortcutFinishesItAsCancelled() async {
        let m = RunShortcutModel(shortcut: "A", documentName: nil) { _ in
            do { try await Task.sleep(for: .seconds(3600)) } catch {}
            return ShortcutRunReport(outcome: .cancelled, summary: "cancelled", level: .info, output: nil, fileURL: nil)
        }
        m.run()
        await Task.yield()
        m.cancel()
        await m.finished()
        guard case .finished(let report) = m.state else { Issue.record("expected finished"); return }
        #expect(report.outcome == .cancelled)
    }

    @Test func cancellingWhenNotRunningDoesNothing() {
        let m = model(Gate())
        m.cancel()
        #expect(m.state == .ready)
    }

    private final class Counter: @unchecked Sendable { var count = 0 }
}
