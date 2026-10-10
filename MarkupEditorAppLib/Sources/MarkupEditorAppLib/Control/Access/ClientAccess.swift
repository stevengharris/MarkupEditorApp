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

/// The program on the other end of a `markup mcp` session, as the CLI reports it from its
/// parent process. A client is remembered by `key`.
public struct ClientIdentity: Codable, Sendable, Hashable {
    /// What to call it in a prompt, such as "Claude" or "node".
    public var name: String
    /// Executable path of the process, or of the app that contains it.
    public var path: String
    public var bundleIdentifier: String?
    /// The Apple team that signed the process, when it is signed by one.
    public var teamIdentifier: String?

    public init(name: String, path: String, bundleIdentifier: String? = nil, teamIdentifier: String? = nil) {
        self.name = name
        self.path = path
        self.bundleIdentifier = bundleIdentifier
        self.teamIdentifier = teamIdentifier
    }

    /// Stable identity for remembering a decision: bundle identifier, signing team and path together,
    /// so a program that copies another app's Info.plist elsewhere, or is signed by someone else,
    /// does not inherit its approval.
    public var key: String { "\(bundleIdentifier ?? "")|\(teamIdentifier ?? "")|\(path)" }
}
