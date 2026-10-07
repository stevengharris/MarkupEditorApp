//
//  ReconnectRefresherTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

@MainActor
struct ReconnectRefresherTests {

    let defaults = InMemoryDefaults()
    static let paid = Member(email: "a@example.test", status: .paid)

    /// A model that launched offline: it has a stored email and its first refresh failed.
    func unavailableModel(_ service: FakeMemberService) async -> SubscriptionModel {
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let model = SubscriptionModel(service: service, defaults: defaults, paidDidChange: { _ in }, applyFirstPaidDefaults: {})
        await model.refresh()
        return model
    }

    /// Feeds `updates` to a refresher and waits until they have all been handled.
    func deliver(_ updates: [Bool], to model: SubscriptionModel) async {
        let (stream, continuation) = AsyncStream.makeStream(of: Bool.self)
        let refresher = ReconnectRefresher(model: model, connectivity: stream)
        for update in updates { continuation.yield(update) }
        continuation.finish()
        await refresher.finished()
    }

    @Test func connectivityReturningAfterAnOfflineLaunchRefreshes() async {
        let service = FakeMemberService(.init(currentMember: [.failure(.transportFailure("offline")), .success(Self.paid)]))
        let model = await unavailableModel(service)
        #expect(model.state == .unavailable(email: "a@example.test"))

        await deliver([false, true], to: model)

        #expect(model.state == .connected(Self.paid))
        #expect(service.calls == ["currentMember", "currentMember"])
    }

    @Test func goingOfflineDoesNotRefresh() async {
        let service = FakeMemberService(.init(currentMember: [.failure(.transportFailure("offline"))]))
        let model = await unavailableModel(service)

        await deliver([false, false], to: model)

        #expect(service.calls == ["currentMember"])
        #expect(model.state == .unavailable(email: "a@example.test"))
    }

    @Test func aStillFailingRefreshIsRetriedOnTheNextReconnect() async {
        let offline = Result<Member?, MemberError>.failure(.transportFailure("offline"))
        let service = FakeMemberService(.init(currentMember: [offline, offline, .success(Self.paid)]))
        let model = await unavailableModel(service)

        await deliver([true, false, true], to: model)

        #expect(service.calls.count == 3)
        #expect(model.state == .connected(Self.paid))
    }

    @Test func aConnectedModelIsNotRefreshed() async {
        let service = FakeMemberService(.init(currentMember: [.success(Self.paid)]))
        defaults.set("a@example.test", forKey: SubscriptionModel.lastEmailKey)
        let model = SubscriptionModel(service: service, defaults: defaults, paidDidChange: { _ in }, applyFirstPaidDefaults: {})
        await model.refresh()

        await deliver([true, true], to: model)

        #expect(service.calls == ["currentMember"])
    }

    @Test func aDisconnectedModelMakesNoRequest() async {
        let service = FakeMemberService()
        let model = SubscriptionModel(service: service, defaults: defaults, paidDidChange: { _ in }, applyFirstPaidDefaults: {})
        await model.refresh()

        await deliver([true], to: model)

        #expect(service.calls.isEmpty)
        #expect(model.state == .disconnected)
    }
}
