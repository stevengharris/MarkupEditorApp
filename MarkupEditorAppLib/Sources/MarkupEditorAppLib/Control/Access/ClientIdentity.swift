//
//  ClientIdentity.swift
//  MarkupEditorAppLib
//

import Foundation

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
    /// For a program run by an interpreter such as node or python, the script it runs, so one interpreter
    /// does not stand for every program it runs.
    public var script: String?

    public init(name: String, path: String, bundleIdentifier: String? = nil, teamIdentifier: String? = nil, script: String? = nil) {
        self.name = name
        self.path = path
        self.bundleIdentifier = bundleIdentifier
        self.teamIdentifier = teamIdentifier
        self.script = script
    }

    /// Stable identity for remembering a decision: bundle identifier, signing team and path together,
    /// so a program that copies another app's Info.plist elsewhere, or is signed by someone else,
    /// does not inherit its approval.
    public var key: String { "\(bundleIdentifier ?? "")|\(teamIdentifier ?? "")|\(path)" + (script.map { "|\($0)" } ?? "") }
}
