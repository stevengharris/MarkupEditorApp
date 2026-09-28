//
//  SubscriptionModelTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Synchronization
import Testing
@testable import MarkupEditorAppLib

/// Scripted stand-in for the site. Each call pops the next result for that call.
final class FakeMemberService: MemberService {

    struct Script {
        var requestCode: [Result<OTCRef, MemberError>] = []
        var verify: [Result<Void, MemberError>] = []
        var currentMember: [Result<Member?, MemberError>] = []
        var signOut: [Result<Void, MemberError>] = []
        var calls: [String] = []
    }

    let script: Mutex<Script>
    /// Runs while the named call is in flight, keyed by call name without arguments.
    let hooks = Mutex<[String: @Sendable () async -> Void]>([:])

    init(_ script: Script = Script()) {
        self.script = Mutex(script)
    }

    var calls: [String] { script.withLock { $0.calls } }

    func during(_ name: String, _ hook: @escaping @Sendable () async -> Void) {
        hooks.withLock { $0[name] = hook }
    }

    private func runHook(_ name: String) async {
        let hook = hooks.withLock { $0[name] }
        await hook?()
    }

    private func next<T: Sendable>(_ name: String, _ path: WritableKeyPath<Script, [Result<T, MemberError>]>) throws(MemberError) -> T {
        let result = script.withLock { script -> Result<T, MemberError>? in
            script.calls.append(name)
            return script[keyPath: path].isEmpty ? nil : script[keyPath: path].removeFirst()
        }
        guard let result else { throw .transportFailure("unscripted \(name)") }
        return try result.get()
    }

    func requestCode(email: String) async throws(MemberError) -> OTCRef {
        await runHook("requestCode")
        return try next("requestCode:\(email)", \.requestCode)
    }
    func verify(code: String, ref: OTCRef) async throws(MemberError) {
        await runHook("verify")
        try next("verify:\(code):\(ref.value)", \.verify)
    }
    func currentMember() async throws(MemberError) -> Member? { try next("currentMember", \.currentMember) }
    func signOut() async throws(MemberError) { try next("signOut", \.signOut) }
}

@MainActor
struct SubscriptionModelTests {

    let defaults: UserDefaults
    var paidChanges: [Bool] { recorder.paid }
    var defaultsApplied: Int { recorder.defaultsApplied }

    final class Recorder {
        var paid: [Bool] = []
        var defaultsApplied = 0
    }
    let recorder = Recorder()

    init() {
        let suite = "SubscriptionModelTests-\(UUID().uuidString)"
        defaults = UserDefaults(suiteName: suite) ?? .standard
        defaults.removePersistentDomain(forName: suite)
    }

    func model(_ service: FakeMemberService) -> SubscriptionModel {
        let recorder = recorder
        return SubscriptionModel(
            service: service,
            defaults: defaults,
            paidDidChange: { recorder.paid.append($0) },
            applyFirstPaidDefaults: { recorder.defaultsApplied += 1 })
    }

    static let paid = Member(email: "a@example.test", status: .paid)
    static let comped = Member(email: "a@example.test", status: .comped)
    static let free = Member(email: "a@example.test", status: .free)

    // MARK: launch

    @Test func refreshWithoutPriorConnectionMakesNoRequest() async {
        let service = FakeMemberService()
        let model = model(service)

        await model.refresh()

        #expect(model.state == .disconnected)
        #expect(service.calls.isEmpty)
        #expect(paidChanges == [false])
    }

    @Test func refreshAfterPriorConnectionRestoresMember() async {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let service = FakeMemberService(.init(currentMember: [.success(Self.paid)]))
        let model = model(service)

        await model.refresh()

        #expect(model.state == .connected(Self.paid))
        #expect(model.isPaidConnected)
        #expect(paidChanges == [true])
    }

    @Test func refreshWithExpiredSessionIsExpired() async {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let service = FakeMemberService(.init(currentMember: [.success(nil)]))
        let model = model(service)

        await model.refresh()

        #expect(model.state == .expired(email: "a@example.test"))
        #expect(!model.isPaidConnected)
        #expect(paidChanges == [false])
    }

    @Test func refreshNetworkFailureKeepsUpdatesOffAndReportsError() async {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let service = FakeMemberService(.init(currentMember: [.failure(.transportFailure("offline"))]))
        let model = model(service)

        await model.refresh()

        #expect(model.state == .unavailable(email: "a@example.test"))
        #expect(model.error == .transportFailure("offline"))
        #expect(paidChanges == [false])
    }

    // MARK: connecting

    @Test func connectFlowReachesConnected() async {
        let ref = OTCRef("ref-1")
        let service = FakeMemberService(.init(requestCode: [.success(ref)], verify: [.success(())], currentMember: [.success(Self.paid)]))
        let model = model(service)

        await model.requestCode(email: " a@example.test ")
        #expect(model.state == .awaitingCode(email: "a@example.test", ref: ref))

        await model.verify(code: " 123456 ")

        #expect(model.state == .connected(Self.paid))
        #expect(service.calls == ["requestCode:a@example.test", "verify:123456:ref-1", "currentMember"])
        #expect(defaults.string(forKey: SubscriptionModel.lastEmailKey) == "a@example.test")
        #expect(paidChanges.last == true)
        #expect(model.error == nil)
    }

    @Test func wrongCodeStaysAwaitingCodeWithError() async {
        let ref = OTCRef("ref-1")
        let service = FakeMemberService(.init(requestCode: [.success(ref)], verify: [.failure(.invalidCode)]))
        let model = model(service)

        await model.requestCode(email: "a@example.test")
        await model.verify(code: "000000")

        #expect(model.state == .awaitingCode(email: "a@example.test", ref: ref))
        #expect(model.error == .invalidCode)
        #expect(defaults.string(forKey: SubscriptionModel.lastEmailKey) == nil)
    }

    @Test func requestCodeFailureStaysDisconnectedWithError() async {
        let service = FakeMemberService(.init(requestCode: [.failure(.unexpectedStatus(429))]))
        let model = model(service)
        await model.refresh()

        await model.requestCode(email: "a@example.test")

        #expect(model.state == .disconnected)
        #expect(model.error == .unexpectedStatus(429))
    }

    @Test func cancelReturnsToDisconnected() async {
        let service = FakeMemberService(.init(requestCode: [.success(OTCRef("ref-1"))]))
        let model = model(service)

        await model.requestCode(email: "a@example.test")
        model.cancel()

        #expect(model.state == .disconnected)
    }

    @Test func cancelDuringVerifyDoesNotConnect() async {
        let service = FakeMemberService(.init(requestCode: [.success(OTCRef("ref-1"))], verify: [.success(())], currentMember: [.success(Self.paid)]))
        let model = model(service)
        await model.requestCode(email: "a@example.test")
        service.during("verify") { await model.cancel() }

        await model.verify(code: "123456")

        #expect(model.state == .disconnected)
        #expect(model.error == nil)
        #expect(defaults.string(forKey: SubscriptionModel.lastEmailKey) == nil)
        #expect(!paidChanges.contains(true))
        #expect(defaultsApplied == 0)
    }

    @Test func cancelDuringRequestCodeDoesNotAwaitCode() async {
        let service = FakeMemberService(.init(requestCode: [.success(OTCRef("ref-1"))]))
        let model = model(service)
        service.during("requestCode") { await model.cancel() }

        await model.requestCode(email: "a@example.test")

        #expect(model.state == .unknown)
    }

    @Test func freeMemberConnectsWithoutUpdates() async {
        let service = FakeMemberService(.init(requestCode: [.success(OTCRef("r"))], verify: [.success(())], currentMember: [.success(Self.free)]))
        let model = model(service)

        await model.requestCode(email: "a@example.test")
        await model.verify(code: "123456")

        #expect(model.state == .connected(Self.free))
        #expect(!model.isPaidConnected)
        #expect(!paidChanges.contains(true))
        #expect(defaultsApplied == 0)
    }

    @Test func compedMemberCountsAsPaid() async {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let model = model(FakeMemberService(.init(currentMember: [.success(Self.comped)])))

        await model.refresh()

        #expect(model.isPaidConnected)
        #expect(paidChanges == [true])
    }

    // MARK: first-time update defaults

    @Test func firstPaidConnectionAppliesDefaultsOnce() async {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let service = FakeMemberService(.init(signOut: [.success(())]))
        service.script.withLock { $0.currentMember = [.success(Self.paid), .success(Self.paid)] }
        service.script.withLock { $0.requestCode = [.success(OTCRef("r"))]; $0.verify = [.success(())] }
        let model = model(service)

        await model.refresh()
        #expect(defaultsApplied == 1)

        await model.disconnect()
        await model.requestCode(email: "a@example.test")
        await model.verify(code: "123456")

        #expect(model.state == .connected(Self.paid))
        #expect(defaultsApplied == 1)
    }

    @Test func defaultsAppliedFlagSurvivesANewModel() async {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        await model(FakeMemberService(.init(currentMember: [.success(Self.paid)]))).refresh()
        await model(FakeMemberService(.init(currentMember: [.success(Self.paid)]))).refresh()

        #expect(defaultsApplied == 1)
    }

    // MARK: disconnecting

    @Test func disconnectSignsOutAndForgetsEmail() async {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let service = FakeMemberService(.init(currentMember: [.success(Self.paid)], signOut: [.success(())]))
        let model = model(service)
        await model.refresh()

        await model.disconnect()

        #expect(model.state == .disconnected)
        #expect(defaults.string(forKey: SubscriptionModel.lastEmailKey) == nil)
        #expect(paidChanges == [true, false])
        #expect(service.calls.last == "signOut")
    }

    @Test func disconnectIsLocalEvenWhenSiteUnreachable() async {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let service = FakeMemberService(.init(currentMember: [.success(Self.paid)], signOut: [.failure(.transportFailure("offline"))]))
        let model = model(service)
        await model.refresh()

        await model.disconnect()

        #expect(model.state == .disconnected)
        #expect(defaults.string(forKey: SubscriptionModel.lastEmailKey) == nil)
        #expect(paidChanges == [true, false])
    }
}
