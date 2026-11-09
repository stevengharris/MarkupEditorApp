//
//  SingleInstanceTests.swift
//  MarkupEditorAppTests
//

import Foundation
import Testing
@testable import MarkupEditorApp

@MainActor
struct SingleInstanceTests {

    private func peer(_ pid: pid_t, regular: Bool = true, terminated: Bool = false) -> SingleInstance.Peer {
        SingleInstance.Peer(processIdentifier: pid, isRegular: regular, isTerminated: terminated)
    }

    @Test func aLoneProcessDoesNotYield() {
        #expect(SingleInstance.peerToYieldTo(from: [peer(10)], excluding: 10) == nil)
        #expect(SingleInstance.peerToYieldTo(from: [], excluding: 10) == nil)
    }

    @Test func anotherRegularInstanceIsYieldedTo() {
        #expect(SingleInstance.peerToYieldTo(from: [peer(10), peer(20)], excluding: 10)?.processIdentifier == 20)
    }

    @Test func aHeadlessExportIsNotAnInstance() {
        #expect(SingleInstance.peerToYieldTo(from: [peer(10), peer(20, regular: false)], excluding: 10) == nil)
    }

    @Test func aTerminatedInstanceIsIgnored() {
        #expect(SingleInstance.peerToYieldTo(from: [peer(10), peer(20, terminated: true)], excluding: 10) == nil)
    }
}
