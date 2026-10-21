//
//  ControlServerRaceTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Darwin
import Synchronization
import Testing
@testable import MarkupEditorAppLib

struct ControlServerRaceTests {

    private static func socketPath() -> String {
        "/tmp/mecs-\(UUID().uuidString.prefix(8)).sock"
    }

    private static func connect(to path: String) -> Int32 {
        guard var address = try? UnixSocket.address(for: path) else { return -1 }
        let fd = socket(AF_UNIX, SOCK_STREAM, 0)
        _ = UnixSocket.withSockaddr(&address, { Darwin.connect(fd, $0, $1) })
        return fd
    }

    /// A stopped server's accept loop must never take connections meant for another server. Stopping a server
    /// frees its listening descriptor number for the next socket to use, so a loop that still called accept on
    /// that number would count another server's connections as its own.
    @Test func serversCountOnlyTheirOwnConnectionsWhileOthersStartAndStop() {
        let problems = Mutex<[String]>([])
        let connectionLimit = 3
        let checksPerChecker = 150
        let checkers = 4

        DispatchQueue.concurrentPerform(iterations: 12) { index in
            if index < checkers {
                for _ in 0..<checksPerChecker {
                    let path = Self.socketPath()
                    let server = ControlServer(path: path, connectionLimit: connectionLimit) { $0 }
                    guard (try? server.start()) != nil else {
                        problems.withLock { $0.append("could not start a server") }
                        continue
                    }
                    let held = (0..<connectionLimit).map { _ in Self.connect(to: path) }
                    let deadline = Date().addingTimeInterval(5)
                    while server.activeConnections != connectionLimit, Date() < deadline { usleep(2000) }
                    if server.activeConnections != connectionLimit {
                        problems.withLock { $0.append("only \(server.activeConnections) of \(connectionLimit) connections were admitted") }
                    }
                    held.forEach { close($0) }
                    server.stop()
                }
            } else {
                // Starts and stops servers as fast as possible, so descriptor numbers are freed and reused constantly.
                for _ in 0..<(checksPerChecker * 6) {
                    let server = ControlServer(path: Self.socketPath(), connectionLimit: connectionLimit) { $0 }
                    try? server.start()
                    server.stop()
                }
            }
        }

        let found = problems.withLock { $0 }
        #expect(found.isEmpty, "\(found.count) problems, e.g. \(found.first ?? "")")
    }
}
