//
//  UpdateGateTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct UpdateGateTests {

    static let feed = UpdateFeed.productionURL

    @Test(arguments: [UpdateGate.Kind.manual, .background])
    func refusesEveryCheckWhileDisconnected(kind: UpdateGate.Kind) {
        var gate = UpdateGate()

        let r1 = gate.refusal(for: kind, feed: Self.feed)
        #expect(r1 == .notConnected)
    }

    @Test(arguments: [UpdateGate.Kind.manual, .background])
    func allowsEveryCheckWhileConnected(kind: UpdateGate.Kind) {
        var gate = UpdateGate()
        _ = gate.setCanCheck(true)

        let r2 = gate.refusal(for: kind, feed: Self.feed)
        #expect(r2 == nil)
    }

    @Test func connectedWithoutAFeedIsRefusedAsInvalidFeed() {
        var gate = UpdateGate()
        _ = gate.setCanCheck(true)

        let r3 = gate.refusal(for: .manual, feed: nil)
        #expect(r3 == .invalidFeed)
        let r4 = gate.refusal(for: .background, feed: nil)
        #expect(r4 == .invalidFeed)
    }

    @Test func disconnectedWithoutAFeedReportsNotConnected() {
        var gate = UpdateGate()

        let r5 = gate.refusal(for: .manual, feed: nil)
        #expect(r5 == .notConnected)
    }

    @Test func refusedBackgroundCheckReplaysOnceOnConnect() {
        var gate = UpdateGate()
        _ = gate.refusal(for: .background, feed: Self.feed)

        let r6 = gate.setCanCheck(true)
        #expect(r6)

        _ = gate.setCanCheck(false)
        let r7 = gate.setCanCheck(true)
        #expect(!r7)
    }

    @Test func refusedManualCheckIsNotReplayed() {
        var gate = UpdateGate()
        _ = gate.refusal(for: .manual, feed: Self.feed)

        let r8 = gate.setCanCheck(true)
        #expect(!r8)
    }

    @Test func connectingWithNothingRefusedDoesNotReplay() {
        var gate = UpdateGate()

        let r9 = gate.setCanCheck(true)
        #expect(!r9)
    }

    @Test func invalidFeedRefusalIsNotRemembered() {
        var gate = UpdateGate()
        _ = gate.setCanCheck(true)
        _ = gate.refusal(for: .background, feed: nil)
        _ = gate.setCanCheck(false)

        let r11 = gate.setCanCheck(true)
        #expect(!r11)
    }
}
