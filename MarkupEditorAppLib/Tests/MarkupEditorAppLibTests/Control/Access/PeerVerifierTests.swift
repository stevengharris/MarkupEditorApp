//
//  PeerVerifierTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Security
import Synchronization
import Testing
@testable import MarkupEditorAppLib

struct PeerVerifierTests {

    func socketPath() -> String { "/tmp/mepv-\(UUID().uuidString.prefix(8)).sock" }

    /// The requirement this very process satisfies, since the test process is the client.
    func ownRequirement() throws -> String {
        var code: SecCode?
        #expect(SecCodeCopySelf([], &code) == errSecSuccess)
        var staticCode: SecStaticCode?
        #expect(SecCodeCopyStaticCode(try #require(code), [], &staticCode) == errSecSuccess)
        var requirement: SecRequirement?
        #expect(SecCodeCopyDesignatedRequirement(try #require(staticCode), [], &requirement) == errSecSuccess)
        var text: CFString?
        #expect(SecRequirementCopyString(try #require(requirement), [], &text) == errSecSuccess)
        return try #require(text as String?)
    }

    func server(at path: String, requirement: String, seen: CallLog<String>) throws -> ControlServer {
        let server = ControlServer(path: path, peerVerifier: CodeSignaturePeerVerifier(requirement: requirement)) { line in
            seen.append("handled")
            let request = try? JSONDecoder().decode(ControlRequest.self, from: line)
            return (try? JSONEncoder().encode(ControlResponse.success(id: request?.id ?? 0, "ok"))) ?? Data()
        }
        try server.start()
        return server
    }

    @Test func aPeerThatSatisfiesTheRequirementIsServed() async throws {
        let path = socketPath(), seen = CallLog<String>()
        let server = try server(at: path, requirement: try ownRequirement(), seen: seen)
        defer { server.stop() }

        let response = try await ControlClient(path: path).send(ControlRequest(id: 4, tool: "x"))

        #expect(response == .success(id: 4, "ok"))
        #expect(seen.all == ["handled"])
    }

    @Test func aPeerThatFailsTheRequirementIsToldSoAndNeverHandled() async throws {
        let path = socketPath(), seen = CallLog<String>()
        let server = try server(at: path, requirement: #"identifier "com.example.not-this-process""#, seen: seen)
        defer { server.stop() }

        let response = try await ControlClient(path: path).send(ControlRequest(id: 5, tool: "x"))

        #expect(!response.ok)
        #expect(response.error?.hasPrefix("Refused") == true)
        #expect(seen.all.isEmpty)
    }

    @Test func anUnparsableRequirementFailsClosed() async throws {
        let path = socketPath(), seen = CallLog<String>()
        let server = try server(at: path, requirement: "this is not a requirement", seen: seen)
        defer { server.stop() }

        let response = try await ControlClient(path: path).send(ControlRequest(id: 6, tool: "x"))

        #expect(!response.ok)
        #expect(seen.all.isEmpty)
    }

    @Test func theDesignatedRequirementOfSignedCodeParses() throws {
        let requirement = try #require(CodeSignaturePeerVerifier.designatedRequirement(ofCodeAt: URL(fileURLWithPath: "/bin/ls")))
        var parsed: SecRequirement?
        #expect(SecRequirementCreateWithString(requirement as CFString, [], &parsed) == errSecSuccess)
    }

    @Test func thereIsNoDesignatedRequirementForAMissingFileOrAnUnsignedOne() throws {
        #expect(CodeSignaturePeerVerifier.designatedRequirement(ofCodeAt: URL(fileURLWithPath: "/nonexistent/tool")) == nil)
        let plain = FileManager.default.temporaryDirectory.appendingPathComponent("plain-\(UUID().uuidString).txt")
        try "text".write(to: plain, atomically: true, encoding: .utf8)
        defer { try? FileManager.default.removeItem(at: plain) }
        #expect(CodeSignaturePeerVerifier.designatedRequirement(ofCodeAt: plain) == nil)
    }
}
