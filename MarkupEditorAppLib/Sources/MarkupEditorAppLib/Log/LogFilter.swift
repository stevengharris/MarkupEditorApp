//
//  LogFilter.swift
//  MarkupEditorAppLib
//

import Foundation

/// Which entries the Log tab shows. Filters by level only.
public enum LogFilter: String, CaseIterable, Identifiable, Sendable {
    case all = "All"
    case info = "Info"
    /// Warnings and errors.
    case issues = "Issues"
    case warnings = "Warnings"
    case errors = "Errors"

    public var id: String { rawValue }

    public func includes(_ level: LogLevel) -> Bool {
        switch self {
        case .all: true
        case .info: level == .info
        case .issues: level >= .warning
        case .warnings: level == .warning
        case .errors: level == .error
        }
    }

    /// The entries this filter shows, in their order.
    public func visible(in entries: [LogEntry]) -> [LogEntry] {
        entries.filter { includes($0.level) }
    }

    /// The selected entries that are also visible, in log order. Selecting everything under a filter
    /// copies only what the filter shows.
    public func selected(_ ids: Set<UUID>, in entries: [LogEntry]) -> [LogEntry] {
        visible(in: entries).filter { ids.contains($0.id) }
    }
}
