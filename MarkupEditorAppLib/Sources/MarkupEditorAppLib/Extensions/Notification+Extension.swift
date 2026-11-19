//
//  Notification+Extension.swift
//  MarkupEditorAppLib
//

import Foundation

public extension Notification.Name {
    /// Posted after the list of chosen Shortcuts is written.
    static let chosenShortcutsDidChange = Notification.Name("chosenShortcutsDidChange")
}
