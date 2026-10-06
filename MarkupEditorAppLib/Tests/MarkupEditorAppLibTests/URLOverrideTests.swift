//
//  URLOverrideTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct URLOverrideTests {

    static let fallback = URL(string: "https://example.test/default")!

    @Test func absentValueIsTheDefault() {
        #expect(URLOverride.resolve(nil, default: Self.fallback) == Self.fallback)
    }

    @Test(arguments: ["http://127.0.0.1:2368", "https://staging.example.test/base"])
    func httpURLStringIsUsed(value: String) {
        #expect(URLOverride.resolve(value, default: Self.fallback)?.absoluteString == value)
    }

    @Test(arguments: ["", "not a url", "file:///tmp/site", "ftp://example.test", "https://"])
    func unusableStringDisablesTheOverride(value: String) {
        #expect(URLOverride.resolve(value, default: Self.fallback) == nil)
    }

    @Test func nonStringValueDisablesTheOverride() {
        #expect(URLOverride.resolve(["https://example.test"], default: Self.fallback) == nil)
        #expect(URLOverride.resolve(42, default: Self.fallback) == nil)
    }
}

struct UnavailableMemberServiceTests {

    let service = UnavailableMemberService(reason: "override is not a URL")

    @Test func everyCallFailsWithTheReason() async {
        let failure = MemberError.transportFailure("override is not a URL")

        await #expect(throws: failure) { try await service.requestCode(email: "a@example.test") }
        await #expect(throws: failure) { try await service.verify(code: "123456", ref: OTCRef("r")) }
        await #expect(throws: failure) { try await service.currentMember() }
        await #expect(throws: failure) { try await service.signOut() }
    }
}
