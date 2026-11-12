//
//  LogEntry.swift
//  MarkupEditorAppLib
//

import Foundation

/// One row of the log: an ordinary entry, or a group holding the messages of one operation.
public struct LogEntry: Identifiable, Sendable {
    public let id: UUID
    /// The latest occurrence.
    public internal(set) var date: Date
    /// For a group, the highest level among its details.
    public let level: LogLevel
    public let category: String?
    /// For a group, the summary.
    public let message: String
    /// Occurrences folded into this entry; 1 when none.
    public internal(set) var count: Int
    /// Empty for an ordinary entry. At most `EditLog.detailCap` distinct details.
    public let details: [LogDetail]
    /// Messages in the batch before folding and the cap; 0 for an ordinary entry.
    public let detailCount: Int

    init(id: UUID = UUID(), date: Date, level: LogLevel, category: String?, message: String,
         count: Int = 1, details: [LogDetail] = [], detailCount: Int = 0) {
        self.id = id
        self.date = date
        self.level = level
        self.category = category
        self.message = message
        self.count = count
        self.details = details
        self.detailCount = detailCount
    }

    /// Whether `other` is the same entry for folding: level, category, message and each detail's level and text.
    func isSame(as other: LogEntry) -> Bool {
        level == other.level && category == other.category && message == other.message
            && details.count == other.details.count
            && zip(details, other.details).allSatisfy { $0.sameContent(as: $1) }
    }
}
