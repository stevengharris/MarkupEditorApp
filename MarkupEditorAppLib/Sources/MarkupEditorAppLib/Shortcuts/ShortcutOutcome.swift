//
//  ShortcutOutcome.swift
//  MarkupEditorAppLib
//

import Foundation

/// How a run of a Shortcut ended.
public enum ShortcutOutcome: Equatable, Sendable {
    /// The script ended without reporting failure: its last line was `exit=0`, or it had no status line. Carries the whole output.
    case succeeded(String)
    /// The status line was `exit=<n>` with n not 0. Carries the whole output.
    case failed(String)
    /// No callback arrived before the timeout.
    case noResponse
    case cancelled
    /// Shortcuts reported an error of its own.
    case shortcutError(String)
}
