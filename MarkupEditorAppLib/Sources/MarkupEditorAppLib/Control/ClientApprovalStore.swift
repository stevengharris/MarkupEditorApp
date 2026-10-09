//
//  ClientApprovalStore.swift
//  MarkupEditorAppLib
//

import Foundation

/// A decision the user made about one client.
public struct ClientApproval: Codable, Sendable, Equatable {
    public var client: ClientIdentity
    public var access: ClientAccess
    public var decided: Date

    public init(client: ClientIdentity, access: ClientAccess, decided: Date) {
        self.client = client
        self.access = access
        self.decided = decided
    }
}

/// Remembers which clients the user allowed. Only allowing is persisted; a refusal lasts for the
/// session so a mistaken click can be corrected by asking again after a relaunch.
public protocol ClientApprovalStore: AnyObject, Sendable {
    func access(for client: ClientIdentity) -> ClientAccess
    func save(_ access: ClientAccess, for client: ClientIdentity)
    func revoke(_ client: ClientIdentity)
    func approvals() -> [ClientApproval]
}

/// Keeps approvals in `UserDefaults`, and refusals in memory.
public final class UserDefaultsApprovalStore: ClientApprovalStore, @unchecked Sendable {

    public static let defaultsKey = "ControlClientApprovals"

    private let defaults: UserDefaults
    private let now: @Sendable () -> Date
    private let lock = NSLock()
    private var refused: Set<String> = []

    public init(defaults: UserDefaults = .standard, now: @escaping @Sendable () -> Date = { Date() }) {
        self.defaults = defaults
        self.now = now
    }

    public func access(for client: ClientIdentity) -> ClientAccess {
        lock.withLock {
            if refused.contains(client.key) { return .denied }
            return load().first { $0.client.key == client.key }?.access ?? .undecided
        }
    }

    public func save(_ access: ClientAccess, for client: ClientIdentity) {
        lock.withLock {
            var all = load().filter { $0.client.key != client.key }
            switch access {
            case .read, .readWrite:
                refused.remove(client.key)
                all.append(ClientApproval(client: client, access: access, decided: now()))
            case .denied:
                refused.insert(client.key)
            case .undecided:
                refused.remove(client.key)
            }
            store(all)
        }
    }

    public func revoke(_ client: ClientIdentity) {
        lock.withLock {
            refused.remove(client.key)
            store(load().filter { $0.client.key != client.key })
        }
    }

    public func approvals() -> [ClientApproval] {
        lock.withLock { load().sorted { $0.client.name.localizedCaseInsensitiveCompare($1.client.name) == .orderedAscending } }
    }

    private func load() -> [ClientApproval] {
        guard let data = defaults.object(forKey: Self.defaultsKey) as? Data else { return [] }
        return (try? JSONDecoder().decode([ClientApproval].self, from: data)) ?? []
    }

    private func store(_ approvals: [ClientApproval]) {
        if let data = try? JSONEncoder().encode(approvals) { defaults.set(data, forKey: Self.defaultsKey) }
    }
}
