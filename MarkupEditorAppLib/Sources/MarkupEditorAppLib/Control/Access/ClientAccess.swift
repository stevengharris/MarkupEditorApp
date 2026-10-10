//
//  ClientAccess.swift
//  MarkupEditorAppLib
//

import Foundation

/// What an assistant that connected through `markup mcp` may do.
public enum ClientAccess: String, Codable, Sendable, Comparable {
    /// No decision yet; the user has not been asked.
    case undecided
    case denied
    /// Read documents and the selection, and open files.
    case read
    /// Everything `read` allows, plus changing the open document.
    case readWrite

    private var rank: Int {
        switch self {
        case .undecided, .denied: 0
        case .read: 1
        case .readWrite: 2
        }
    }

    public static func < (lhs: ClientAccess, rhs: ClientAccess) -> Bool { lhs.rank < rhs.rank }

    /// True when this access permits a tool that needs `required`. Undecided and denied permit nothing.
    public func permits(_ required: ClientAccess) -> Bool {
        switch self {
        case .undecided, .denied: false
        case .read, .readWrite: self >= required
        }
    }
}
