//
//  EditQueueTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor struct EditQueueTests {

    @MainActor final class Log {
        private(set) var entries: [String] = []
        func add(_ entry: String) { entries.append(entry) }
    }

    struct Boom: Error {}

    @Test func overlappingOperationsRunOneAtATimeInArrivalOrder() async throws {
        let queue = EditQueue()
        let log = Log()
        let slow = queue.enqueue {
            log.add("slow start")
            try await Task.sleep(for: .milliseconds(150))
            log.add("slow end")
        }
        let quick = queue.enqueue { log.add("quick") }
        try await slow.value
        try await quick.value
        #expect(log.entries == ["slow start", "slow end", "quick"])
    }

    @Test func aFailureReachesItsCallerAndDoesNotStopTheNextOperation() async throws {
        let queue = EditQueue()
        let log = Log()
        let failing = queue.enqueue { throw Boom() }
        let following = queue.enqueue { log.add("ran") }
        var failed = false
        do { try await failing.value } catch is Boom { failed = true }
        try await following.value
        #expect(failed)
        #expect(log.entries == ["ran"])
    }

    @Test func eachOperationSeesWhatThePreviousOneLeft() async throws {
        let queue = EditQueue()
        let log = Log()
        let a = queue.enqueue { log.add("a"); return log.entries.count }
        let b = queue.enqueue { log.add("b"); return log.entries.count }
        #expect(try await a.value == 1)
        #expect(try await b.value == 2)
    }

    @Test func runWaitsForTheOperationAndReturnsItsValue() async throws {
        let queue = EditQueue()
        let value = try await queue.run { 42 }
        #expect(value == 42)
    }
}
