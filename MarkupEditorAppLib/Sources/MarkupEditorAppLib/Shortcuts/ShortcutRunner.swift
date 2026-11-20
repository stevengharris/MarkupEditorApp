//
//  ShortcutRunner.swift
//  MarkupEditorAppLib
//

import AppKit
import Foundation

/// Runs a Shortcut: opens it, waits for the callback and logs the outcome.
@MainActor
public final class ShortcutRunner {

    public typealias Opener = @MainActor (URL) async -> Bool

    private let runStore: ShortcutRunStore
    private let outputStore: ShortcutOutputStore
    private let log: EditLog
    private let opener: Opener
    private let reader: ShortcutLibraryReader?

    private static let category = "Shortcuts"

    public init(runStore: ShortcutRunStore = .shared, outputStore: ShortcutOutputStore = .standard, log: EditLog = .shared,
                opener: @escaping Opener = ShortcutRunner.openWithoutActivating,
                reader: ShortcutLibraryReader? = ShortcutLibraryReader()) {
        self.runStore = runStore
        self.outputStore = outputStore
        self.log = log
        self.opener = opener
        self.reader = reader
    }

    /// Runs the Shortcut called `name` and reports how it ended. When `documentPath` is given, the Shortcut
    /// receives it as text input, so a script reads it as `$1` and needs no other way to find the document.
    /// Opens nothing and
    /// reports `.refused` when any Shortcut is running, since Shortcuts drops the callbacks of a run
    /// when another starts.
    public func runShortcut(named name: String, documentPath: String? = nil) async -> ShortcutRunReport {
        if let missing = await missingReport(for: name) { return missing }
        if Task.isCancelled {
            log.info("\"\(name)\": cancelled", category: Self.category)
            return ShortcutRunReport(outcome: .cancelled, summary: "cancelled", level: .info, output: nil, fileURL: nil)
        }
        guard let ticket = runStore.begin(shortcutName: name) else {
            let same = runStore.isRunning(name)
            let message = same ? "\"\(name)\" is already running." : "\"\(name)\" was not run because another Shortcut is running."
            log.warning(message, category: Self.category)
            return ShortcutRunReport(outcome: .refused, summary: same ? "already running" : "another Shortcut is running",
                                   level: .warning, output: nil, fileURL: nil)
        }
        log.info("Running Shortcut \"\(name)\"", category: Self.category)
        if let shortcutURL = Self.shortcutURL(target: name, id: ticket.id, documentPath: documentPath) {
            if !(await opener(shortcutURL)) {
                runStore.complete(ticket.id, with: .shortcutError("Shortcuts could not be opened."))
            }
        } else {
            runStore.complete(ticket.id, with: .shortcutError("The Shortcut address could not be built."))
        }
        let outcome = await ticket.result()
        return finish(outcome, name: name)
    }

    /// Opens `url` without bringing the app that handles it to the front, so a Shortcuts launch does not take
    /// the focus from the document.
    public static func openWithoutActivating(_ url: URL) async -> Bool {
        let configuration = NSWorkspace.OpenConfiguration()
        configuration.activates = false
        do {
            _ = try await NSWorkspace.shared.open(url, configuration: configuration)
            return true
        } catch {
            return false
        }
    }

    /// A report when the library, read now, has no Shortcut called `name`, since Shortcuts sends no callback for
    /// an unknown name and the run would wait out the timeout. Nil when the Shortcut exists or the library
    /// could not be read.
    private func missingReport(for name: String) async -> ShortcutRunReport? {
        guard let reader else { return nil }
        let library: ShortcutLibrary
        do {
            library = try await reader.read()
        } catch {
            if !(error is CancellationError) {
                log.warning("The Shortcuts library could not be checked before running \"\(name)\": \((error as? LocalizedError)?.errorDescription ?? error.localizedDescription)", category: Self.category)
            }
            return nil
        }
        guard !library.contains(name: name) else { return nil }
        let summary = "not found in Shortcuts; check its name"
        log.error("\"\(name)\": \(summary)", category: Self.category)
        return ShortcutRunReport(outcome: .shortcutError(summary), summary: summary, level: .error, output: nil, fileURL: nil)
    }

    /// The address that runs `target`, with `documentPath` as text input when given, and the callbacks for
    /// run `id`. Every value is percent-encoded except unreserved characters.
    static func shortcutURL(target: String, id: UUID, documentPath: String? = nil) -> URL? {
        let callbacks = ShortcutCallbackURL.urls(for: id)
        var pairs = [("name", target)]
        if let documentPath { pairs += [("input", "text"), ("text", documentPath)] }
        pairs += [("x-success", callbacks.success.absoluteString),
                  ("x-error", callbacks.error.absoluteString),
                  ("x-cancel", callbacks.cancel.absoluteString)]
        let query = pairs.map { name, value in "\(name)=\(QueryValueEncoding.encode(value))" }.joined(separator: "&")
        return URL(string: "shortcuts://x-callback-url/run-shortcut?\(query)")
    }

    private func finish(_ outcome: ShortcutOutcome, name: String) -> ShortcutRunReport {
        var output: String?
        var text: String
        var level = LogLevel.error
        switch outcome {
        case .succeeded(let result):
            output = result
            text = "succeeded"
            level = .info
        case .failed(let result):
            output = result
            text = "failed (exit=\(ShortcutStatus.exitCode(forResult: result) ?? -1))"
        case .noResponse:
            text = "no response from Shortcut '\(name)'; check that it exists and Allow Running Scripts is on"
        case .cancelled:
            text = "cancelled"
            level = .info
        case .refused:
            text = "not started because a Shortcut is already running"
            level = .warning
        case .shortcutError(let message):
            if let code = ShortcutStatus.exitCode(forShortcutError: message) {
                text = "failed (exit=\(code)); Shortcuts keeps no output from a script that exits non-zero. To see it, print exit=<n> as the last line, then exit 0"
            } else {
                text = "Shortcuts reported an error: \(message)"
            }
        }
        var file: URL?
        if let output, !output.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            do {
                file = try outputStore.write(output: output, shortcutName: name)
            } catch {
                log.warning("The output of \"\(name)\" could not be saved: \(error.localizedDescription)", category: Self.category)
            }
        }
        var tail: String?
        if let output {
            let shown = ShortcutOutputStore.tail(of: ShortcutStatus.body(ofResult: output))
            if !shown.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty { tail = shown }
        }
        post(level, "\"\(name)\": \(text)", output: tail, fileURL: file)
        return ShortcutRunReport(outcome: outcome, summary: text, level: level, output: tail, fileURL: file)
    }

    private func post(_ level: LogLevel, _ message: String, output: String? = nil, fileURL: URL? = nil) {
        switch level {
        case .info: log.info(message, category: Self.category, output: output, fileURL: fileURL)
        case .warning: log.warning(message, category: Self.category, output: output, fileURL: fileURL)
        case .error: log.error(message, category: Self.category, output: output, fileURL: fileURL)
        }
    }
}
