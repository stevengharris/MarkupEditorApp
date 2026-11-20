//
//  ShortcutRunReport.swift
//  MarkupEditorAppLib
//

import Foundation

/// How a run ended, as the Log and the run dialog show it.
public struct ShortcutRunReport: Equatable, Sendable {
    public let outcome: ShortcutOutcome
    /// A short phrase such as "succeeded" or "failed (exit=3)".
    public let summary: String
    public let level: LogLevel
    /// The last lines of the script's output, without its status line; nil when there is none.
    public let output: String?
    /// The file that holds all of the output; nil when there is none.
    public let fileURL: URL?
}
