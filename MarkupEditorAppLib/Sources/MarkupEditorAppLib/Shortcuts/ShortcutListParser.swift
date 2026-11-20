//
//  ShortcutListParser.swift
//  MarkupEditorAppLib
//

import Foundation

/// Reads the output of `shortcuts list --show-identifiers`: one `Name (UUID)` per line.
public enum ShortcutListParser {

    /// A name can contain parentheses, so the identifier is the last parenthesized UUID on the line.
    /// Blank lines and lines without an identifier are skipped.
    public static func entries(from output: String) -> [ShortcutEntry] {
        let line = /^(.*) \(([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})\)$/
        return output.split(whereSeparator: \.isNewline).compactMap { raw in
            let trimmed = raw.trimmingCharacters(in: .whitespaces)
            guard let match = trimmed.wholeMatch(of: line) else { return nil }
            return ShortcutEntry(name: String(match.1), identifier: String(match.2))
        }
    }
}
