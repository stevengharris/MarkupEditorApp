//
//  ControlServerWakeTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct ControlServerWakeTests {

    /// An accept loop that waits on a timeout notices a stop only when the timeout expires, which takes up to the
    /// full interval. One that is woken on stop leaves at once, so even the slowest of many stops is quick.
    @Test func stoppingEndsTheAcceptLoopAtOnceNotAfterATimeout() throws {
        var slowest = 0.0
        for _ in 0..<30 {
            let server = ControlServer(path: "/tmp/mecs-\(UUID().uuidString.prefix(8)).sock") { $0 }
            try server.start()
            let started = Date().addingTimeInterval(5)
            while !server.isAccepting, Date() < started { usleep(500) }
            try #require(server.isAccepting, "the accept loop never started")

            let stopped = Date()
            server.stop()
            let deadline = Date().addingTimeInterval(5)
            while server.isAccepting, Date() < deadline { usleep(500) }
            #expect(!server.isAccepting, "the accept loop never ended")
            slowest = max(slowest, Date().timeIntervalSince(stopped))
        }
        #expect(slowest < 0.04, "the slowest stop took \(slowest) s")
    }

    @Test func aServerCanBeStartedAgainAfterItStops() async throws {
        let path = "/tmp/mecs-\(UUID().uuidString.prefix(8)).sock"
        let server = ControlServer(path: path) { line in
            guard let request = try? JSONDecoder().decode(ControlRequest.self, from: line) else { return Data() }
            return (try? JSONEncoder().encode(ControlResponse.success(id: request.id, request.args))) ?? Data()
        }
        try server.start()
        server.stop()
        try server.start()
        defer { server.stop() }

        let response = try await ControlClient(path: path).send(ControlRequest(id: 9, tool: "x", args: ["a": "b"]))
        #expect(response == .success(id: 9, ["a": "b"]))
    }
}
