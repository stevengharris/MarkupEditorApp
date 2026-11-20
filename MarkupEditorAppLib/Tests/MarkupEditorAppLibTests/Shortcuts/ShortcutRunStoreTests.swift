//
//  ShortcutRunStoreTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

@MainActor
@Suite(.serialized)
struct ShortcutRunStoreTests {

    private final class Gate: @unchecked Sendable {
        private let stream: AsyncStream<Void>
        private let continuation: AsyncStream<Void>.Continuation
        init() { (stream, continuation) = AsyncStream.makeStream() }
        func open() { continuation.yield(); continuation.finish() }
        func wait() async { for await _ in stream { return } }
    }

    private static let dropWarning = "Ignored a Shortcut result with an unknown or already used id."

    /// All occurrences of `message` in the shared log, counting folded repeats.
    private func occurrences(of message: String) -> Int {
        EditLog.shared.entries.filter { $0.message == message }.reduce(0) { $0 + $1.count }
    }

    private func store(timeout: Duration = .seconds(120), gate: Gate = Gate()) -> (ShortcutRunStore, Gate) {
        (ShortcutRunStore(timeout: timeout, sleeper: { _ in await gate.wait() }), gate)
    }

    private func callback(_ url: URL, adding items: [URLQueryItem]) -> URL {
        var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        components.queryItems = (components.queryItems ?? []) + items
        return components.url!
    }

    private func result(_ value: String) -> URLQueryItem { URLQueryItem(name: "result", value: value) }

    // MARK: URLs

    @Test func callbackURLsCarryTheSchemeTheHostAndTheRunId() {
        let id = UUID()
        let urls = ShortcutCallbackURL.urls(for: id)
        #expect(ShortcutCallbackURL.scheme == "markupeditor-action")
        #expect(urls.success.absoluteString == "markupeditor-action://success?run=\(id.uuidString)")
        #expect(urls.error.absoluteString == "markupeditor-action://error?run=\(id.uuidString)")
        #expect(urls.cancel.absoluteString == "markupeditor-action://cancel?run=\(id.uuidString)")
    }

    @Test func buildAndParseRoundTrip() throws {
        let id = UUID()
        let urls = ShortcutCallbackURL.urls(for: id)
        let text = "Plan:\n\ntitle: Café & more=100%\nexit=0\n"
        let success = try #require(ShortcutCallbackURL.parse(callback(urls.success, adding: [result(text)])))
        #expect(success.id == id)
        #expect(success.callback == .success(result: text))
        let failure = try #require(ShortcutCallbackURL.parse(callback(urls.error, adding: [URLQueryItem(name: "errorMessage", value: "No such Shortcut")])))
        #expect(failure.callback == .error(message: "No such Shortcut"))
        let cancel = try #require(ShortcutCallbackURL.parse(urls.cancel))
        #expect(cancel.id == id)
        #expect(cancel.callback == .cancel)
    }

    @Test func aSuccessWithoutAResultParsesAsAnEmptyResult() throws {
        let urls = ShortcutCallbackURL.urls(for: UUID())
        #expect(try #require(ShortcutCallbackURL.parse(urls.success)).callback == .success(result: ""))
    }

    @Test func anErrorWithoutAMessageStillParses() throws {
        let urls = ShortcutCallbackURL.urls(for: UUID())
        guard case .error(let message) = try #require(ShortcutCallbackURL.parse(urls.error)).callback else {
            Issue.record("expected an error callback"); return
        }
        #expect(!message.isEmpty)
    }

    @Test func onlyURLsWithTheActionSchemeAreHandled() {
        for text in ["markupeditor-action://success?run=x", "MarkupEditor-Action://cancel", "markupeditor-action:anything"] {
            #expect(ShortcutCallbackURL.handles(URL(string: text)!), "\(text)")
        }
        for text in ["file:///tmp/a.md", "https://example.com/markupeditor-action", "shortcuts://run-shortcut", "markupeditor://x"] {
            #expect(!ShortcutCallbackURL.handles(URL(string: text)!), "\(text)")
        }
    }

    @Test func malformedURLsParseToNil() {
        let id = UUID().uuidString
        for text in ["https://success?run=\(id)", "markupeditor-action://unknown?run=\(id)", "markupeditor-action://success",
                     "markupeditor-action://success?run=not-a-uuid", "markupeditor-action://?run=\(id)", "markupeditor-action:success"] {
            #expect(ShortcutCallbackURL.parse(URL(string: text)!) == nil, "\(text)")
        }
    }

    // MARK: Status line

    @Test func theStatusLineDecidesTheOutcome() {
        #expect(ShortcutStatus.outcome(forResult: "done\nexit=0\n") == .succeeded("done\nexit=0\n"))
        #expect(ShortcutStatus.outcome(forResult: "boom\nexit=3") == .failed("boom\nexit=3"))
        #expect(ShortcutStatus.outcome(forResult: "no status here") == .succeeded("no status here"))
        #expect(ShortcutStatus.outcome(forResult: "") == .succeeded(""))
    }

    @Test func onlyTheLastNonEmptyLineCounts() {
        #expect(ShortcutStatus.outcome(forResult: "exit=0\nthen it printed more") == .succeeded("exit=0\nthen it printed more"))
        #expect(ShortcutStatus.outcome(forResult: "x\nexit=1\n\n  \n") == .failed("x\nexit=1\n\n  \n"))
        #expect(ShortcutStatus.outcome(forResult: "x\r\nexit=0\r\n") == .succeeded("x\r\nexit=0\r\n"))
        #expect(ShortcutStatus.outcome(forResult: "x\nexit=oops") == .succeeded("x\nexit=oops"))
        #expect(ShortcutStatus.outcome(forResult: "x\n exit=0 ") == .succeeded("x\n exit=0 "))
    }

    @Test func aLongResultKeepsItsFinalStatusLine() {
        let big = String(repeating: "a line of output that goes on\n", count: 4_000) + "exit=2\n"
        #expect(big.utf8.count > 100_000)
        #expect(ShortcutStatus.outcome(forResult: big) == .failed(big))
        let many = (1...300).map { "line \($0)" }.joined(separator: "\n") + "\nexit=0"
        #expect(ShortcutStatus.outcome(forResult: many) == .succeeded(many))
    }

    // MARK: Run store

    @Test func aSuccessCallbackCompletesTheRun() async throws {
        let (store, _) = store()
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        #expect(store.isRunning("Publish"))
        #expect(store.runningNames == ["Publish"])
        let waiter = Task { await ticket.result() }
        store.receive(callback(ShortcutCallbackURL.urls(for: ticket.id).success, adding: [result("ok\nexit=0\n")]))
        #expect(await waiter.value == .succeeded("ok\nexit=0\n"))
        #expect(!store.isRunning("Publish"))
        #expect(store.runningNames.isEmpty)
    }

    @Test func aCallbackBeforeTheAwaitIsStillDelivered() async throws {
        let (store, _) = store()
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        store.receive(callback(ShortcutCallbackURL.urls(for: ticket.id).success, adding: [result("bad\nexit=1")]))
        #expect(await ticket.result() == .failed("bad\nexit=1"))
    }

    @Test func errorAndCancelCallbacksCompleteTheRun() async throws {
        let (store, _) = store()
        let first = try #require(store.begin(shortcutName: "A"))
        store.receive(callback(ShortcutCallbackURL.urls(for: first.id).error, adding: [URLQueryItem(name: "errorMessage", value: "No such Shortcut")]))
        #expect(await first.result() == .shortcutError("No such Shortcut"))
        let second = try #require(store.begin(shortcutName: "A"))
        store.receive(ShortcutCallbackURL.urls(for: second.id).cancel)
        #expect(await second.result() == .cancelled)
        #expect(store.runningNames.isEmpty)
    }

    @Test func unknownRepeatedAndLateIdsAreDroppedWithOneWarningEach() async throws {
        let (store, _) = store()
        let before = occurrences(of: Self.dropWarning)
        store.receive(callback(ShortcutCallbackURL.urls(for: UUID()).success, adding: [result("secret output\nexit=0")]))
        #expect(occurrences(of: Self.dropWarning) == before + 1)
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        let urls = ShortcutCallbackURL.urls(for: ticket.id)
        store.receive(callback(urls.success, adding: [result("one\nexit=0")]))
        store.receive(callback(urls.success, adding: [result("two\nexit=0")]))
        #expect(occurrences(of: Self.dropWarning) == before + 2)
        #expect(await ticket.result() == .succeeded("one\nexit=0"))
        #expect(!EditLog.shared.entries.contains { $0.message.contains("secret output") })
    }

    @Test func aCallbackCanOnlyCompleteTheRunThatOwnsItsId() async throws {
        let (store, _) = store()
        let a = try #require(store.begin(shortcutName: "A"))
        store.receive(ShortcutCallbackURL.urls(for: a.id).cancel)
        #expect(await a.result() == .cancelled)
        let b = try #require(store.begin(shortcutName: "B"))
        store.receive(callback(ShortcutCallbackURL.urls(for: a.id).success, adding: [result("a\nexit=0")]))
        #expect(store.isRunning("B"))
        store.receive(callback(ShortcutCallbackURL.urls(for: b.id).success, adding: [result("b\nexit=0")]))
        #expect(await b.result() == .succeeded("b\nexit=0"))
    }

    @Test func aMalformedCallbackIsDroppedWithAWarning() {
        let (store, _) = store()
        let message = "Ignored a malformed Shortcut result."
        let before = occurrences(of: message)
        store.receive(URL(string: "markupeditor-action://success?run=nope")!)
        #expect(occurrences(of: message) == before + 1)
    }

    @Test func aSecondBeginIsRefusedWhileAnyRunGoesAndAllowedAfter() async throws {
        let (store, _) = store()
        let first = try #require(store.begin(shortcutName: "Publish"))
        #expect(store.begin(shortcutName: "Publish") == nil)
        #expect(store.begin(shortcutName: "Other") == nil)
        #expect(store.isBusy)
        store.receive(ShortcutCallbackURL.urls(for: first.id).cancel)
        _ = await first.result()
        #expect(!store.isBusy)
        #expect(store.begin(shortcutName: "Other") != nil)
    }

    @Test func aRunNobodyAnswersEndsAsNoResponseAndALaterCallbackIsDroppedQuietly() async throws {
        let (store, gate) = store()
        let before = occurrences(of: Self.dropWarning)
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        let waiter = Task { await ticket.result() }
        gate.open()
        #expect(await waiter.value == .noResponse)
        #expect(!store.isRunning("Publish"))
        store.receive(callback(ShortcutCallbackURL.urls(for: ticket.id).success, adding: [result("late\nexit=0")]))
        #expect(occurrences(of: Self.dropWarning) == before)
        #expect(await ticket.result() == .noResponse)
        #expect(store.begin(shortcutName: "Publish") != nil)
    }

    @Test func aCallbackAfterTheUserCancelledIsDroppedQuietly() async throws {
        let (store, _) = store()
        let before = occurrences(of: Self.dropWarning)
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        let waiter = Task { await ticket.result() }
        await Task.yield()
        waiter.cancel()
        #expect(await waiter.value == .cancelled)
        store.receive(callback(ShortcutCallbackURL.urls(for: ticket.id).success, adding: [result("late\nexit=0")]))
        store.receive(ShortcutCallbackURL.urls(for: ticket.id).cancel)
        #expect(occurrences(of: Self.dropWarning) == before)
    }

    @Test func aSecondCallbackAfterAnAnsweredRunStillWarns() async throws {
        let (store, _) = store()
        let before = occurrences(of: Self.dropWarning)
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        let urls = ShortcutCallbackURL.urls(for: ticket.id)
        store.receive(callback(urls.success, adding: [result("one\nexit=0")]))
        store.receive(callback(urls.success, adding: [result("two\nexit=0")]))
        #expect(occurrences(of: Self.dropWarning) == before + 1)
    }

    @Test func theTimeoutIsOneHundredTwentySeconds() {
        #expect(ShortcutRunStore.timeout == .seconds(120))
    }

    private final class Flag: @unchecked Sendable {
        private let lock = NSLock()
        private var raised = false
        func set() { lock.lock(); raised = true; lock.unlock() }
        var value: Bool { lock.lock(); defer { lock.unlock() }; return raised }
    }

    @Test func completingARunCancelsItsTimer() async throws {
        let cancelled = Flag()
        let store = ShortcutRunStore(timeout: .seconds(120), sleeper: { _ in
            await withTaskCancellationHandler { await Gate().wait() } onCancel: { cancelled.set() }
        })
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        #expect(!cancelled.value)
        store.receive(callback(ShortcutCallbackURL.urls(for: ticket.id).success, adding: [result("ok\nexit=0")]))
        let deadline = Date().addingTimeInterval(2)
        while !cancelled.value && Date() < deadline { try await Task.sleep(for: .milliseconds(5)) }
        #expect(cancelled.value)
        #expect(await ticket.result() == .succeeded("ok\nexit=0"))
    }

    @Test func cancellingTheAwaitingTaskFreesTheAction() async throws {
        let (store, _) = store()
        let ticket = try #require(store.begin(shortcutName: "Publish"))
        let waiter = Task { await ticket.result() }
        await Task.yield()
        waiter.cancel()
        #expect(await waiter.value == .cancelled)
        #expect(!store.isRunning("Publish"))
        #expect(store.begin(shortcutName: "Publish") != nil)
    }
}
