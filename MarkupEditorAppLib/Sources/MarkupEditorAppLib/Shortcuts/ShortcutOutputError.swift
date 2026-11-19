//
//  ShortcutOutputError.swift
//  MarkupEditorAppLib
//

import Foundation

public enum ShortcutOutputError: LocalizedError, Equatable {
    case writeFailed(String)

    public var errorDescription: String? {
        switch self {
        case .writeFailed(let reason): "The Shortcut's output could not be saved: \(reason)"
        }
    }
}
