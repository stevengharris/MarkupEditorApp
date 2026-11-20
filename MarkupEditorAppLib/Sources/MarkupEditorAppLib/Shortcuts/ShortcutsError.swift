//
//  ShortcutsError.swift
//  MarkupEditorAppLib
//

import Foundation

public enum ShortcutsError: LocalizedError, Equatable, Sendable {
    case launchFailed(String)
    case timedOut
    case failed(status: Int32, message: String)

    public var errorDescription: String? {
        switch self {
        case .launchFailed(let message): "The shortcuts command could not be started: \(message)"
        case .timedOut: "The shortcuts command did not answer in time."
        case .failed(let status, let message):
            message.isEmpty ? "The shortcuts command failed (status \(status))." : "The shortcuts command failed: \(message)"
        }
    }
}
