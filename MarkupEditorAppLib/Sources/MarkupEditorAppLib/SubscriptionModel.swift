//
//  SubscriptionModel.swift
//  MarkupEditorAppLib
//

import Foundation
import Observation

/// The member operations SubscriptionModel needs from the site.
public protocol MemberService: Sendable {
    func requestCode(email: String) async throws(MemberError) -> OTCRef
    func verify(code: String, ref: OTCRef) async throws(MemberError)
    func currentMember() async throws(MemberError) -> Member?
    func signOut() async throws(MemberError)
}

extension MemberClient: MemberService {}

/// The app's connection to a markupeditor.app membership.
@MainActor
@Observable
public final class SubscriptionModel {

    public enum State: Equatable {
        /// Not yet checked this launch.
        case unknown
        case disconnected
        /// A sign-in code was emailed to `email`.
        case awaitingCode(email: String, ref: OTCRef)
        case connected(Member)
        /// Was connected, but the site no longer recognizes the session.
        case expired(email: String)
        /// Was connected, but the site couldn't be reached to confirm it.
        case unavailable(email: String)
    }

    /// Set only while connected, so a launch never contacts the site for someone who never connected.
    public static let lastEmailKey = "subscriptionLastEmail"
    /// Set once the first paid connection has turned on automatic update checks.
    public static let updateDefaultsAppliedKey = "subscriptionUpdateDefaultsApplied"

    public private(set) var state: State = .unknown
    public private(set) var error: MemberError?
    public private(set) var isWorking = false

    public var isPaidConnected: Bool {
        if case .connected(let member) = state { return member.isPaid }
        return false
    }

    /// The email to prefill when reconnecting.
    public var lastEmail: String? { defaults.string(forKey: Self.lastEmailKey) }

    @ObservationIgnored private let service: MemberService
    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let paidDidChange: @MainActor (Bool) -> Void
    @ObservationIgnored private let applyFirstPaidDefaults: @MainActor () -> Void
    /// Bumped by cancel() so a sign-in call that finishes afterward is ignored.
    @ObservationIgnored private var signInAttempt = 0

    /// - Parameters:
    ///   - paidDidChange: Called with the new paid-connected value after every state change.
    ///   - applyFirstPaidDefaults: Called once ever, on the first paid connection.
    public init(service: MemberService,
                defaults: UserDefaults = .standard,
                paidDidChange: @escaping @MainActor (Bool) -> Void,
                applyFirstPaidDefaults: @escaping @MainActor () -> Void) {
        self.service = service
        self.defaults = defaults
        self.paidDidChange = paidDidChange
        self.applyFirstPaidDefaults = applyFirstPaidDefaults
    }

    /// Confirms the stored session with the site.
    public func refresh() async {
        guard let email = lastEmail else {
            setState(.disconnected)
            return
        }
        await work {
            do throws(MemberError) {
                if let member = try await service.currentMember() {
                    connect(member)
                } else {
                    setState(.expired(email: email))
                }
            } catch {
                self.error = error
                setState(.unavailable(email: email))
            }
        }
    }

    public func requestCode(email: String) async {
        let email = email.trimmingCharacters(in: .whitespacesAndNewlines)
        let attempt = signInAttempt
        await work {
            do throws(MemberError) {
                let ref = try await service.requestCode(email: email)
                guard attempt == signInAttempt else { return }
                setState(.awaitingCode(email: email, ref: ref))
            } catch {
                guard attempt == signInAttempt else { return }
                self.error = error
            }
        }
    }

    public func verify(code: String) async {
        guard case .awaitingCode(_, let ref) = state else { return }
        let code = code.trimmingCharacters(in: .whitespacesAndNewlines)
        let attempt = signInAttempt
        await work {
            do throws(MemberError) {
                try await service.verify(code: code, ref: ref)
                guard attempt == signInAttempt else { return }
                let member = try await service.currentMember()
                guard attempt == signInAttempt else { return }
                if let member {
                    connect(member)
                } else {
                    self.error = .invalidCode
                }
            } catch {
                guard attempt == signInAttempt else { return }
                self.error = error
            }
        }
    }

    /// Abandons a sign-in in progress.
    public func cancel() {
        signInAttempt += 1
        error = nil
        if case .awaitingCode = state {
            setState(.disconnected)
        }
    }

    /// Signs out on the site if it can be reached, and forgets the connection locally regardless.
    public func disconnect() async {
        await work {
            do throws(MemberError) {
                try await service.signOut()
            } catch {
                self.error = error
            }
            defaults.removeObject(forKey: Self.lastEmailKey)
            setState(.disconnected)
        }
    }

    private func connect(_ member: Member) {
        defaults.set(member.email, forKey: Self.lastEmailKey)
        if member.isPaid, !defaults.bool(forKey: Self.updateDefaultsAppliedKey) {
            defaults.set(true, forKey: Self.updateDefaultsAppliedKey)
            applyFirstPaidDefaults()
        }
        setState(.connected(member))
    }

    private func setState(_ newState: State) {
        state = newState
        paidDidChange(isPaidConnected)
    }

    private func work(_ body: () async -> Void) async {
        error = nil
        isWorking = true
        await body()
        isWorking = false
    }
}
