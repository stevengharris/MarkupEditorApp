//
//  CurrentDocumentStateTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct CurrentDocumentStateTests {

    private let date = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func itRoundTripsThroughJSON() throws {
        let state = CurrentDocumentState(path: "/Users/me/post.md", modified: true, pid: 4812, updated: date)
        let decoded = try CurrentDocumentState.decode(from: state.encoded())
        #expect(decoded == state)
    }

    @Test func aNullPathSurvivesTheRoundTrip() throws {
        let state = CurrentDocumentState(path: nil, modified: false, pid: 7, updated: date)
        #expect(try CurrentDocumentState.decode(from: state.encoded()).path == nil)
    }

    @Test func theFileShapeIsStable() throws {
        let state = CurrentDocumentState(path: "/a b/é.md", modified: false, pid: 12, updated: date)
        let object = try #require(JSONSerialization.jsonObject(with: state.encoded()) as? [String: Any])
        #expect(Set(object.keys) == ["version", "path", "modified", "pid", "updated"])
        #expect(object["version"] as? Int == 1)
        #expect(object["path"] as? String == "/a b/é.md")
        #expect(object["updated"] as? String == "2027-01-15T08:00:00Z")
    }

    @Test func aNullPathIsWrittenAsNull() throws {
        let state = CurrentDocumentState(path: nil, modified: false, pid: 1, updated: date)
        let text = try #require(String(data: state.encoded(), encoding: .utf8))
        #expect(text.contains("\"path\" : null"))
    }

    @Test func garbageDoesNotDecode() {
        #expect(throws: (any Error).self) { try CurrentDocumentState.decode(from: Data("not json".utf8)) }
        #expect(throws: (any Error).self) { try CurrentDocumentState.decode(from: Data()) }
    }
}
