//
//  ControlAuthorizer.swift
//  MarkupEditorAppLib
//

import Foundation

/// Decides what a client may do, asking the user when it has not been decided.
@MainActor
public protocol ControlAuthorizing {
    /// The client's access. When `prompting` is true and nothing is decided yet, asks the user.
    func access(for client: ClientIdentity?, prompting: Bool) async -> ClientAccess
}

@MainActor
public final class ControlAuthorizer: ControlAuthorizing {

    public typealias Prompt = @MainActor (ClientIdentity) async -> ClientAccess

    private let store: ClientApprovalStore
    private let isEnabled: @MainActor () -> Bool
    private let prompt: Prompt
    private var asking: [String: Task<ClientAccess, Never>] = [:]

    /// - Parameters:
    ///   - isEnabled: Whether assistant connections are turned on; when not, every client is denied.
    ///   - prompt: Shows the user's choice for a client with no stored decision.
    public init(store: ClientApprovalStore, isEnabled: @escaping @MainActor () -> Bool, prompt: @escaping Prompt) {
        self.store = store
        self.isEnabled = isEnabled
        self.prompt = prompt
    }

    public func access(for client: ClientIdentity?, prompting: Bool) async -> ClientAccess {
        guard isEnabled(), let client else { return .denied }
        let stored = store.access(for: client)
        guard stored == .undecided, prompting else { return stored }
        // Concurrent requests from one client share a single prompt.
        if let existing = asking[client.key] { return await existing.value }
        let task = Task { @MainActor in
            let choice = await self.prompt(client)
            self.store.save(choice, for: client)
            return choice
        }
        asking[client.key] = task
        let choice = await task.value
        asking[client.key] = nil
        return choice
    }
}

/// Grants every client full access without asking, for Debug builds.
@MainActor
public struct OpenAuthorizer: ControlAuthorizing {
    public init() {}
    public func access(for client: ClientIdentity?, prompting: Bool) async -> ClientAccess { .readWrite }
}
