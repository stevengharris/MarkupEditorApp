//
//  ShortcutStatus.swift
//  MarkupEditorAppLib
//

import Foundation

/// Reads the status line a backing script prints as its last line: `exit=<n>`.
public enum ShortcutStatus {

    /// The outcome for a raw result. The whole result is passed on; only the last non-empty line decides. Shortcuts
    /// reports a script that exits non-zero as an error, so a result with no status line is a success.
    public static func outcome(forResult result: String) -> ShortcutOutcome {
        guard let code = exitCode(forResult: result) else { return .succeeded(result) }
        return code == 0 ? .succeeded(result) : .failed(result)
    }

    /// The `n` of a last non-empty line `exit=<n>`, or nil when the result has no such line.
    public static func exitCode(forResult result: String) -> Int? {
        let last = result.split(whereSeparator: \.isNewline)
            .last { !$0.trimmingCharacters(in: .whitespaces).isEmpty }
            .map { $0.trimmingCharacters(in: .whitespaces) }
        guard let last, last.hasPrefix("exit=") else { return nil }
        return Int(last.dropFirst("exit=".count))
    }

    /// The result without its status line, which the log reports in the entry's message.
    public static func body(ofResult result: String) -> String {
        var lines = result.replacingOccurrences(of: "\r\n", with: "\n").components(separatedBy: "\n")
        while let last = lines.last, last.trimmingCharacters(in: .whitespaces).isEmpty { lines.removeLast() }
        if exitCode(forResult: result) != nil { lines.removeLast() }
        return lines.joined(separator: "\n")
    }

    /// The `n` of Shortcuts' own message for a script that exited non-zero, `Exit code: <n>`, or nil.
    public static func exitCode(forShortcutError message: String) -> Int? {
        let trimmed = message.trimmingCharacters(in: .whitespacesAndNewlines)
        guard trimmed.lowercased().hasPrefix("exit code:") else { return nil }
        return Int(trimmed.dropFirst("exit code:".count).trimmingCharacters(in: .whitespaces))
    }
}
