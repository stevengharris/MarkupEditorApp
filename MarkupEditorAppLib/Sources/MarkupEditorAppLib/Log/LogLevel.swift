//
//  LogLevel.swift
//  MarkupEditorAppLib
//

/// The severity of a log entry. Ordered so the highest level in a group can be found with `max`.
public enum LogLevel: Int, Comparable, Sendable {
    case info, warning, error

    /// A raw type blocks the synthesized `Comparable`.
    public static func < (lhs: LogLevel, rhs: LogLevel) -> Bool { lhs.rawValue < rhs.rawValue }

    /// Word used in the plain-text form.
    public var label: String {
        switch self {
        case .info: "info"
        case .warning: "warning"
        case .error: "error"
        }
    }

    public var emoji: String {
        switch self {
        case .info: "ℹ️"
        case .warning: "⚠️"
        case .error: "❌"
        }
    }
}
