//
//  ShortcutLink.swift
//  MarkupEditorAppLib
//

import Foundation

/// Addresses for opening a Shortcut in the Shortcuts app.
public enum ShortcutLink {

    /// The address that opens the Shortcut called `name` in Shortcuts, or nil when `name` is blank.
    public static func openShortcutURL(name: String) -> URL? {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return nil }
        return URL(string: "shortcuts://open-shortcut?name=\(QueryValueEncoding.encode(trimmed))")
    }
}
