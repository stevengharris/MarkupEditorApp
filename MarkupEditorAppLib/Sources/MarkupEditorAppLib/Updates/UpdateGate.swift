//
//  UpdateGate.swift
//  MarkupEditorAppLib
//

import Foundation

/// Decides whether an update check may run: only while a paid member is connected
/// and a usable feed exists. Remembers a scheduled check it refused so it can be
/// replayed once a paid member connects.
public struct UpdateGate {

    public enum Refusal: Error, Equatable, Sendable {
        case notConnected
        case invalidFeed
    }

    public enum Kind: Sendable {
        case manual
        case background
    }

    public private(set) var canCheck = false
    private var refusedBackgroundCheck = false

    public init() {}

    /// Records the paid-connected state. Returns true when a background check
    /// refused earlier should run now.
    public mutating func setCanCheck(_ newValue: Bool) -> Bool {
        canCheck = newValue
        guard newValue, refusedBackgroundCheck else { return false }
        refusedBackgroundCheck = false
        return true
    }

    /// Nil when the check may run, otherwise why not. A refused background check is remembered.
    public mutating func refusal(for kind: Kind, feed: URL?) -> Refusal? {
        guard canCheck else {
            if kind == .background { refusedBackgroundCheck = true }
            return .notConnected
        }
        return feed == nil ? .invalidFeed : nil
    }
}
