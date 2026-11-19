//
//  ShortcutRunnerTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

@MainActor
struct ShortcutRunnerTests {

    private final class Gate: @unchecked Sendable {
        private let stream: AsyncStream<Void>
        private let continuation: AsyncStream<Void>.Continuation
        init() { (stream, continuation) = AsyncStream.makeStream() }
        func open() { continuation.yield(); continuation.finish() }
        func wait() async { for await _ in stream { return } }
    }

    private final class Opened {
        var urls: [URL] = []
        var result = true
    }

    private struct Rig {
        let runner: ShortcutRunner
        let runs: ShortcutRunStore
        let log: EditLog
        let opened: Opened
        let gate: Gate
        let outputDirectory: URL
        let cleanup: () -> Void
    }

    private func rig(outputIsBlocked: Bool = false, reader: ShortcutLibraryReader? = nil) throws -> Rig {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutRunnerTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let directory = root.appendingPathComponent("shortcuts")
        if outputIsBlocked { try Data().write(to: directory) }
        let gate = Gate()
        let runs = ShortcutRunStore(timeout: .seconds(120), sleeper: { _ in await gate.wait() })
        let log = EditLog()
        let opened = Opened()
        let runner = ShortcutRunner(runStore: runs, outputStore: ShortcutOutputStore(directory: directory), log: log,
                                  opener: { url in opened.urls.append(url); return opened.result }, reader: reader)
        return Rig(runner: runner, runs: runs, log: log, opened: opened, gate: gate, outputDirectory: directory,
                   cleanup: { try? FileManager.default.removeItem(at: root) })
    }

    private let shortcut = "Publish"
    private let document = URL(fileURLWithPath: "/Users/me/Blog Posts/it's $5 & more + 100%/Café = post/post.md")

    /// Starts a run and waits until the Shortcut URL has been opened.
    private func start(_ rig: Rig, _ name: String? = nil) async -> Task<ShortcutRunReport, Never> {
        let before = rig.opened.urls.count
        let task = Task { await rig.runner.runShortcut(named: name ?? self.shortcut) }
        while rig.opened.urls.count == before { await Task.yield() }
        return task
    }

    private func items(_ url: URL) -> [String: String] {
        let pairs = URLComponents(url: url, resolvingAgainstBaseURL: false)?.queryItems ?? []
        return Dictionary(uniqueKeysWithValues: pairs.map { ($0.name, $0.value ?? "") })
    }

    private func runID(_ rig: Rig) throws -> UUID {
        let last = try #require(rig.opened.urls.last)
        let success = try #require(items(last)["x-success"])
        let url = try #require(URL(string: success))
        return try #require(ShortcutCallbackURL.parse(url)).id
    }

    private func answer(_ rig: Rig, _ pick: (URL, URL, URL) -> URL, result: String? = nil, message: String? = nil) throws {
        let urls = ShortcutCallbackURL.urls(for: try runID(rig))
        var components = URLComponents(url: pick(urls.success, urls.error, urls.cancel), resolvingAgainstBaseURL: false)!
        if let result { components.queryItems?.append(URLQueryItem(name: "result", value: result)) }
        if let message { components.queryItems?.append(URLQueryItem(name: "errorMessage", value: message)) }
        rig.runs.receive(components.url!)
    }

    // MARK: The Shortcut URL

    @Test func theShortcutURLCarriesTheNameAndTheThreeCallbacksAndNoInput() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        let url = try #require(rig.opened.urls.first)
        #expect(url.scheme == "shortcuts")
        #expect(url.host == "x-callback-url")
        #expect(url.path == "/run-shortcut")
        let values = items(url)
        #expect(values.count == 4)
        #expect(values["name"] == "Publish")
        #expect(values["input"] == nil)
        #expect(values["text"] == nil)
        let urls = ShortcutCallbackURL.urls(for: try runID(rig))
        #expect(values["x-success"] == urls.success.absoluteString)
        #expect(values["x-error"] == urls.error.absoluteString)
        #expect(values["x-cancel"] == urls.cancel.absoluteString)
        try answer(rig, { _, _, c in c })
        _ = await task.value
    }

    @Test func theDocumentPathTravelsAsEncodedTextInputBetweenTheNameAndTheCallbacks() throws {
        let path = "/Users/me/My Docs/Café $x \"q\" it's.md"
        let url = try #require(ShortcutRunner.shortcutURL(target: "Publish Post", id: UUID(), documentPath: path))
        let query = try #require(url.absoluteString.split(separator: "?", maxSplits: 1).last)
        let parts = query.split(separator: "&").map(String.init)
        #expect(parts.count == 6)
        #expect(parts[0] == "name=Publish%20Post")
        #expect(parts[1] == "input=text")
        #expect(parts[2].hasPrefix("text="))
        let encoded = String(parts[2].dropFirst("text=".count))
        #expect(encoded.removingPercentEncoding == path)
        #expect(!encoded.contains(" ") && !encoded.contains("$") && !encoded.contains("\""))
        #expect(parts[3].hasPrefix("x-success=") && parts[4].hasPrefix("x-error=") && parts[5].hasPrefix("x-cancel="))
    }

    @Test func theRawURLEncodesTheNameAndCarriesNoInputWithoutADocument() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig, "Publish Post")
        let raw = try #require(rig.opened.urls.first).absoluteString
        let query = try #require(raw.split(separator: "?", maxSplits: 1).last)
        #expect(query.split(separator: "&").first == "name=Publish%20Post")
        #expect(query.split(separator: "&").count == 4)
        #expect(!raw.contains(document.lastPathComponent))
        try answer(rig, { _, _, c in c })
        _ = await task.value
    }

    // MARK: Start and completion

    @Test func theStartEntryIsWrittenBeforeTheRunEnds() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        #expect(rig.log.entries.map(\.message) == ["Running Shortcut \"Publish\""])
        #expect(rig.log.entries.first?.level == .info)
        #expect(rig.log.entries.first?.category == "Shortcuts")
        #expect(rig.runs.isRunning("Publish"))
        try answer(rig, { s, _, _ in s }, result: "ok\nexit=0\n")
        _ = await task.value
        #expect(!rig.runs.isRunning("Publish"))
    }

    @Test func aSuccessWritesAStartEntryAndAResultEntryWithItsOutput() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { s, _, _ in s }, result: "created post\nexit=0\n")
        #expect(await task.value.outcome == .succeeded("created post\nexit=0\n"))
        let entries = rig.log.entries
        #expect(entries.map(\.message) == ["Running Shortcut \"Publish\"", "\"Publish\": succeeded"])
        #expect(entries.map(\.level) == [.info, .info])
        #expect(entries.allSatisfy { $0.category == "Shortcuts" })
        #expect(entries[0].output == nil && entries[0].fileURL == nil)
        #expect(entries[1].output == "created post")
        #expect(entries[1].fileURL != nil)
        #expect(rig.log.unreadLevel == nil)
    }

    @Test func aFailureIsAnErrorWithItsExitCode() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { s, _, _ in s }, result: "boom\nexit=3")
        #expect(await task.value.outcome == .failed("boom\nexit=3"))
        #expect(rig.log.entries[1].message == "\"Publish\": failed (exit=3)")
        #expect(rig.log.entries[1].level == .error)
        #expect(rig.log.entries[1].output == "boom")
        #expect(rig.log.entries.count == 2)
        #expect(rig.log.unreadLevel == .error)
    }

    @Test func outputWithoutAStatusLineIsASuccess() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { s, _, _ in s }, result: "no status")
        #expect(await task.value.outcome == .succeeded("no status"))
        #expect(rig.log.entries[1].message == "\"Publish\": succeeded")
        #expect(rig.log.entries[1].level == .info)
    }

    @Test func aShortcutsErrorIsAnErrorWithItsMessage() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { _, e, _ in e }, message: "No such Shortcut")
        #expect(await task.value.outcome == .shortcutError("No such Shortcut"))
        #expect(rig.log.entries.map(\.message) == ["Running Shortcut \"Publish\"",
                                                   "\"Publish\": Shortcuts reported an error: No such Shortcut"])
        #expect(rig.log.entries[1].level == .error)
    }

    @Test func aScriptThatExitsNonZeroIsReportedAsAFailureWithItsExitCodeAndAHint() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { _, e, _ in e }, message: "Exit code: 64")
        #expect(await task.value.outcome == .shortcutError("Exit code: 64"))
        let result = rig.log.entries[1]
        #expect(result.message.hasPrefix("\"Publish\": failed (exit=64)"))
        #expect(result.message.contains("exit 0"))
        #expect(result.level == .error)
        #expect(result.output == nil && result.fileURL == nil)
    }

    @Test func aCancelledRunIsInformationWithNoTail() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { _, _, c in c })
        #expect(await task.value.outcome == .cancelled)
        #expect(rig.log.entries.map(\.message) == ["Running Shortcut \"Publish\"", "\"Publish\": cancelled"])
        #expect(rig.log.entries[1].level == .info)
    }

    @Test func aRunNobodyAnswersEndsWithTheNoResponseText() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        rig.gate.open()
        #expect(await task.value.outcome == .noResponse)
        #expect(rig.log.entries[1].message == "\"Publish\": no response from Shortcut 'Publish'; check that it exists and Allow Running Scripts is on")
        #expect(rig.log.entries[1].level == .error)
        #expect(rig.log.entries.count == 2)
    }

    // MARK: Output file and tail

    @Test func theTailHoldsFiftyLinesAndTheLinkOpensAFileWithAllOfThem() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        let output = (1...300).map { "line \($0)" }.joined(separator: "\n") + "\nexit=0\n"
        try answer(rig, { s, _, _ in s }, result: output)
        _ = await task.value
        let result = try #require(rig.log.entries.last)
        let shown = try #require(result.output).components(separatedBy: "\n")
        #expect(shown == (251...300).map { "line \($0)" })
        #expect(shown.count == 50)
        #expect(result.level == .info)
        let file = try #require(result.fileURL)
        #expect(file.deletingLastPathComponent().lastPathComponent == "runs")
        #expect(try String(contentsOf: file, encoding: .utf8) == output)
    }

    @Test func emptyOutputLeavesTheResultEntryWithoutOutput() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { s, _, _ in s }, result: "")
        #expect(await task.value.outcome == .succeeded(""))
        #expect(rig.log.entries.count == 2)
        #expect(rig.log.entries[1].output == nil)
        #expect(rig.log.entries[1].fileURL == nil)
    }

    @Test func aFailureToSaveTheOutputIsAWarningAndTheResultIsStillLogged() async throws {
        let rig = try rig(outputIsBlocked: true)
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { s, _, _ in s }, result: "done\nexit=0")
        #expect(await task.value.outcome == .succeeded("done\nexit=0"))
        let messages = rig.log.entries.map(\.message)
        #expect(messages.contains("\"Publish\": succeeded"))
        let warning = try #require(rig.log.entries.first { $0.level == .warning })
        #expect(warning.message.hasPrefix("The output of \"Publish\" could not be saved"))
        let result = try #require(rig.log.entries.first { $0.message == "\"Publish\": succeeded" })
        #expect(result.output == "done")
        #expect(result.fileURL == nil)
    }

    @Test func theReportCarriesTheSummaryOutputAndFile() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        try answer(rig, { s, _, _ in s }, result: "created post\nexit=0\n")
        let report = await task.value
        #expect(report.summary == "succeeded")
        #expect(report.level == .info)
        #expect(report.output?.contains("created post") == true)
        #expect(report.fileURL != nil)
    }

    // MARK: Refusals

    @Test func aSecondStartWhileRunningIsRefusedAndOpensNothing() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        let second = await rig.runner.runShortcut(named: shortcut)
        #expect(second.outcome == .cancelled)
        #expect(rig.opened.urls.count == 1)
        #expect(rig.log.entries.contains { $0.level == .warning && $0.message == "\"Publish\" is already running." })
        try answer(rig, { _, _, c in c })
        _ = await task.value
    }

    @Test func aDifferentShortcutIsRefusedWhileOneRunsAndOpensNothing() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        let task = await start(rig)
        let other = await rig.runner.runShortcut(named: "Other")
        #expect(other.outcome == .cancelled)
        #expect(other.summary == "another Shortcut is running")
        #expect(rig.opened.urls.count == 1)
        #expect(rig.log.entries.contains { $0.level == .warning && $0.message == "\"Other\" was not run because another Shortcut is running." })
        try answer(rig, { _, _, c in c })
        _ = await task.value
    }

    private func library(_ names: [String]) -> ShortcutLibraryReader {
        ShortcutLibraryReader { arguments in
            guard arguments.contains("none") else { return "" }
            return names.map { "\($0) (11111111-1111-1111-1111-111111111111)" }.joined(separator: "\n")
        }
    }

    @Test func aShortcutMissingFromTheLibraryIsRefusedAtOnceAndOpensNothing() async throws {
        let rig = try rig(reader: library(["Other"]))
        defer { rig.cleanup() }
        let report = await rig.runner.runShortcut(named: "Publish")
        guard case .shortcutError = report.outcome else { Issue.record("expected a Shortcuts error"); return }
        #expect(report.level == .error)
        #expect(report.summary == "not found in Shortcuts; check its name")
        #expect(rig.opened.urls.isEmpty)
        #expect(!rig.runs.isBusy)
        #expect(rig.log.entries.contains { $0.level == .error && $0.message == "\"Publish\": not found in Shortcuts; check its name" })
    }

    @Test func cancellingDuringTheLibraryReadOpensNothing() async throws {
        let readStarted = Gate()
        let release = Gate()
        let reader = ShortcutLibraryReader { arguments in
            readStarted.open()
            await release.wait()
            guard arguments.contains("none") else { return "" }
            return "Publish (11111111-1111-1111-1111-111111111111)"
        }
        let rig = try rig(reader: reader)
        defer { rig.cleanup() }
        let task = Task { await rig.runner.runShortcut(named: "Publish") }
        await readStarted.wait()
        task.cancel()
        release.open()
        let report = await task.value
        #expect(report.outcome == .cancelled)
        #expect(rig.opened.urls.isEmpty)
        #expect(!rig.runs.isBusy)
    }

    @Test func aShortcutInTheLibraryIsOpened() async throws {
        let rig = try rig(reader: library(["Publish"]))
        defer { rig.cleanup() }
        rig.opened.result = false
        _ = await rig.runner.runShortcut(named: "Publish")
        #expect(rig.opened.urls.count == 1)
    }

    @Test func aLibraryThatCannotBeReadDoesNotStopTheRun() async throws {
        struct Failure: Error {}
        let rig = try rig(reader: ShortcutLibraryReader { _ in throw Failure() })
        defer { rig.cleanup() }
        rig.opened.result = false
        _ = await rig.runner.runShortcut(named: "Publish")
        #expect(rig.opened.urls.count == 1)
    }

    @Test func anOpenerThatReturnsFalseGivesAShortcutErrorAndFreesTheShortcut() async throws {
        let rig = try rig()
        defer { rig.cleanup() }
        rig.opened.result = false
        let outcome = await rig.runner.runShortcut(named: shortcut)
        guard case .shortcutError(let message) = outcome.outcome else { Issue.record("expected a Shortcuts error"); return }
        #expect(!message.isEmpty)
        #expect(!rig.runs.isRunning("Publish"))
        #expect(rig.log.entries.first?.message == "Running Shortcut \"Publish\"")
        #expect(rig.log.entries.contains { $0.level == .error && $0.message.hasPrefix("\"Publish\": Shortcuts reported an error") })
    }
}
