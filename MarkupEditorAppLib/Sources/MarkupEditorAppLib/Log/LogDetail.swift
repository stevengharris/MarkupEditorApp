//
//  LogDetail.swift
//  MarkupEditorAppLib
//

/// One message of a grouped log entry, with the number of identical messages folded into it.
public struct LogDetail: Sendable, Equatable {
    public let level: LogLevel
    public let text: String
    public internal(set) var count: Int

    init(level: LogLevel, text: String, count: Int = 1) {
        self.level = level
        self.text = text
        self.count = count
    }

    /// Whether `other` has the same level and text, ignoring the count.
    func sameContent(as other: LogDetail) -> Bool {
        level == other.level && text == other.text
    }
}
