//
//  SubscriptionLogTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

@MainActor
struct SubscriptionLogTests {

    let defaults = InMemoryDefaults()
    let log = EditLog()
    static let email = "a@example.test"
    static let paid = Member(email: email, status: .paid)

    func model(_ service: FakeMemberService) -> SubscriptionModel {
        SubscriptionModel(service: service, defaults: defaults, log: log, paidDidChange: { _ in }, applyFirstPaidDefaults: {})
    }

    func remember() {
        defaults.set(Self.email, forKey: SubscriptionModel.lastEmailKey)
    }

    func noEntryNamesTheAccount() -> Bool {
        !log.plainText(header: "").contains(Self.email)
    }

    @Test func connectingAndDisconnectingLogNothing() async {
        remember()
        let model = model(FakeMemberService(.init(currentMember: [.success(Self.paid), .success(Self.paid)], signOut: [.success(())])))
        await model.refresh()
        await model.refresh()
        await model.disconnect()
        #expect(log.entries.isEmpty)
        #expect(log.unreadLevel == nil)
    }

    @Test func anExpiredSessionIsAWarning() async {
        remember()
        let model = model(FakeMemberService(.init(currentMember: [.success(nil)])))
        await model.refresh()
        #expect(log.entries.map(\.message) == ["Your markupeditor.app session expired; reconnect to check for updates"])
        #expect(log.entries[0].level == .warning)
        #expect(log.unreadLevel == .warning)
        #expect(noEntryNamesTheAccount())
    }

    @Test func aFailedSignInIsAWarning() async {
        let ref = OTCRef("ref-1")
        let model = model(FakeMemberService(.init(requestCode: [.success(ref)], verify: [.failure(.invalidCode)])))
        await model.requestCode(email: Self.email)
        await model.verify(code: "000000")
        #expect(log.entries.count == 1)
        #expect(log.entries[0].level == .warning)
        #expect(log.entries[0].message.hasPrefix("Sign-in failed"))
        #expect(noEntryNamesTheAccount())
    }

    @Test func aFailedCodeRequestIsAWarning() async {
        let model = model(FakeMemberService(.init(requestCode: [.failure(.unexpectedStatus(500))])))
        await model.requestCode(email: Self.email)
        #expect(log.entries.count == 1)
        #expect(log.entries[0].level == .warning)
        #expect(log.entries[0].message.hasPrefix("Sign-in failed"))
    }

    @Test func offlineTwiceInOneSessionIsOneInformationEntryThatDoesNotLightTheIndicator() async {
        remember()
        let model = model(FakeMemberService(.init(currentMember: [.failure(.transportFailure("offline")), .failure(.transportFailure("offline"))])))
        await model.refresh()
        log.info("another entry")
        log.markRead()
        await model.refresh()
        #expect(log.entries.count == 2)
        #expect(log.entries[0].level == .info)
        #expect(log.entries[0].count == 2)
        #expect(log.entries[0].message == "Could not reach markupeditor.app to confirm your subscription")
        #expect(log.unreadLevel == nil)
        #expect(noEntryNamesTheAccount())
    }

    @Test func aServerFailureThatIsNotOfflineIsAWarning() async {
        remember()
        let model = model(FakeMemberService(.init(currentMember: [.failure(.unexpectedStatus(503))])))
        await model.refresh()
        #expect(log.entries.count == 1)
        #expect(log.entries[0].level == .warning)
        #expect(log.unreadLevel == .warning)
    }
}
