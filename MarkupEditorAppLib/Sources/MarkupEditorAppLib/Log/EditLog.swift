//
//  EditLog.swift
//  MarkupEditorAppLib
//

import Foundation
import Observation
import OSLog

/// The log shown in the Log tab. Entries are kept in memory only.
@MainActor @Observable
public final class EditLog {

    /// Shared by code that is not a view. Off the main actor, reach it through `record`.
    public static let shared = EditLog()

    public static let entryCap = 1_000
    public static let detailCap = 200
    nonisolated static let subsystem = "com.stevengharris.MarkupEditorApp"

    public private(set) var entries: [LogEntry] = []

    /// Highest warning or error level recorded since `markRead()`; nil when none is unread.
    /// Information entries never set it. Every other new occurrence sets it, including a fold; a `once` repeat does not.
    public private(set) var unreadLevel: LogLevel?

    /// Maps a `once` key to the id of the entry that carries it. Released when the entry leaves the log.
    @ObservationIgnored private var keys: [String: UUID] = [:]

    /// Dates entries recorded through the instance methods. Replaced in tests.
    @ObservationIgnored var clock: @Sendable () -> Date = { Date() }

    public init() {}

    /// Number of `once` keys held; tests check that keys are released with their entries.
    var keyCount: Int { keys.count }

    // MARK: Recording

    public func info(_ message: String, category: String? = nil, once: String? = nil) {
        post(.info, message, category: category, once: once)
    }

    public func warning(_ message: String, category: String? = nil, once: String? = nil) {
        post(.warning, message, category: category, once: once)
    }

    public func error(_ message: String, category: String? = nil, once: String? = nil) {
        post(.error, message, category: category, once: once)
    }

    /// Records one group entry for a batch. An empty batch records nothing; one message records an
    /// ordinary entry, prefixed with the context.
    public func group(_ messages: [(level: LogLevel, text: String)], context: String, category: String? = nil, once: String? = nil) {
        switch messages.count {
        case 0:
            return
        case 1:
            post(messages[0].level, "\(context): \(messages[0].text)", category: category, once: once)
        default:
            let (details, distinct) = Self.foldedDetails(messages)
            let level = messages.map(\.level).max() ?? .info
            let summary = Self.summary(context: context, level: level, messages: messages, distinct: distinct)
            Self.writeOSLog(level, summary, category: category)
            for message in messages { Self.writeOSLog(message.level, message.text, category: category) }
            append(LogEntry(date: clock(), level: level, category: category, message: summary,
                            details: details, detailCount: messages.count), once: once)
        }
    }

    public func warnings(_ messages: [String], context: String, category: String? = nil, once: String? = nil) {
        group(messages.map { (level: LogLevel.warning, text: $0) }, context: context, category: category, once: once)
    }

    /// Callable from any thread. Takes the date and writes OSLog on the calling thread, then appends
    /// synchronously when already on the main thread, otherwise after a hop to the main actor.
    public nonisolated static func record(_ level: LogLevel, _ message: String, category: String? = nil, once: String? = nil) {
        let date = Date()
        writeOSLog(level, message, category: category)
        let entry = LogEntry(date: date, level: level, category: category, message: message)
        if Thread.isMainThread {
            MainActor.assumeIsolated { shared.append(entry, once: once) }
        } else {
            Task { @MainActor in shared.append(entry, once: once) }
        }
    }

    public func markRead() {
        unreadLevel = nil
    }

    public func clear() {
        entries = []
        keys = [:]
        unreadLevel = nil
    }

    // MARK: Plain text

    public func plainText(header: String) -> String {
        plainText(entries: entries, header: header)
    }

    /// The given entries, such as the selected rows, in the form used for the whole log. A count above 1
    /// is appended to the message, so on its last line when the message has several.
    public func plainText(entries: [LogEntry], header: String) -> String {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        var lines = header.isEmpty ? [] : [header, ""]
        for entry in entries {
            let prefix = "\(formatter.string(from: entry.date)) [\(entry.level.label)] " + (entry.category.map { "\($0): " } ?? "")
            lines.append(prefix + Self.indented(Self.counted(entry.message, entry.count)))
            for detail in entry.details {
                lines.append("    [\(detail.level.label)] " + Self.indented(Self.counted(detail.text, detail.count), by: "        "))
            }
        }
        return lines.joined(separator: "\n")
    }

    // MARK: Internals

    private func post(_ level: LogLevel, _ message: String, category: String?, once: String?) {
        Self.writeOSLog(level, message, category: category)
        append(LogEntry(date: clock(), level: level, category: category, message: message), once: once)
    }

    /// A keyed call is resolved before folding: a key still in the log updates that entry and adds no row;
    /// otherwise the entry is a new row. Without a key, an entry equal to the last one folds into it.
    func append(_ entry: LogEntry, once: String?) {
        if let once {
            if let id = keys[once], let index = entries.firstIndex(where: { $0.id == id }) {
                entries[index].count += 1
                entries[index].date = entry.date
                return
            }
            keys[once] = entry.id
        } else if let last = entries.last, last.isSame(as: entry) {
            entries[entries.count - 1].count += 1
            entries[entries.count - 1].date = entry.date
            raiseUnread(entry.level)
            return
        }
        entries.append(entry)
        raiseUnread(entry.level)
        trim()
    }

    private func raiseUnread(_ level: LogLevel) {
        guard level > .info else { return }
        if let current = unreadLevel {
            unreadLevel = max(current, level)
        } else {
            unreadLevel = level
        }
    }

    private func trim() {
        let excess = entries.count - Self.entryCap
        guard excess > 0 else { return }
        let dropped = Set(entries.prefix(excess).map(\.id))
        entries.removeFirst(excess)
        if !keys.isEmpty { keys = keys.filter { !dropped.contains($0.value) } }
    }

    private struct DetailKey: Hashable {
        let level: LogLevel
        let text: String
    }

    /// Details folded by level and text in order of first appearance, capped, and the distinct count before the cap.
    private static func foldedDetails(_ messages: [(level: LogLevel, text: String)]) -> (details: [LogDetail], distinct: Int) {
        var details: [LogDetail] = []
        var positions: [DetailKey: Int] = [:]
        for message in messages {
            let key = DetailKey(level: message.level, text: message.text)
            if let position = positions[key] {
                details[position].count += 1
            } else {
                positions[key] = details.count
                details.append(LogDetail(level: message.level, text: message.text))
            }
        }
        return (Array(details.prefix(detailCap)), details.count)
    }

    private static func summary(context: String, level: LogLevel, messages: [(level: LogLevel, text: String)], distinct: Int) -> String {
        let noun = if messages.allSatisfy({ $0.level == .warning }) { "warnings" }
            else if messages.allSatisfy({ $0.level == .error }) { "errors" }
            else { "messages" }
        let total = messages.count.formatted(.number.locale(Locale(identifier: "en_US")))
        return "\(context): \(total) \(noun)" + (distinct > detailCap ? " (first \(detailCap) shown)" : "")
    }

    private static func counted(_ text: String, _ count: Int) -> String {
        count > 1 ? "\(text) (×\(count))" : text
    }

    /// Indents the continuation lines of a multi-line message.
    private static func indented(_ text: String, by indent: String = "    ") -> String {
        text.split(separator: "\n", omittingEmptySubsequences: false).enumerated()
            .map { $0.offset == 0 ? String($0.element) : indent + $0.element }
            .joined(separator: "\n")
    }

    private nonisolated static func writeOSLog(_ level: LogLevel, _ message: String, category: String?) {
        let logger = Logger(subsystem: subsystem, category: category ?? "Edit")
        switch level {
        case .info: logger.info("\(message, privacy: .public)")
        case .warning: logger.warning("\(message, privacy: .public)")
        case .error: logger.error("\(message, privacy: .public)")
        }
    }
}
