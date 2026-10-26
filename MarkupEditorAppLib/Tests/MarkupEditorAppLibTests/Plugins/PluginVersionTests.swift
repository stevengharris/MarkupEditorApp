//
//  PluginVersionTests.swift
//  MarkupEditorAppLibTests
//

import Testing
@testable import MarkupEditorAppLib

struct PluginVersionTests {

    @Test(arguments: [("1.0.1", "1.0.0"), ("1.1.0", "1.0.9"), ("2.0.0", "1.9.9"), ("0.10.0", "0.9.0"), ("1.0.0.1", "1.0.0"), ("1.2", "1.1.9")])
    func aGreaterVersionIsNewer(version: String, installed: String) {
        #expect(PluginVersion.isNewer(version, than: installed))
    }

    @Test(arguments: [("1.0.0", "1.0.0"), ("1.0", "1.0.0"), ("1.0.0", "1.0.1"), ("1.9.9", "2.0.0"), ("0.9.0", "0.10.0")])
    func anEqualOrLowerVersionIsNotNewer(version: String, installed: String) {
        #expect(!PluginVersion.isNewer(version, than: installed))
    }

    @Test func aSuffixOnAComponentIsIgnored() {
        #expect(PluginVersion.isNewer("1.1.0-beta", than: "1.0.0"))
        #expect(!PluginVersion.isNewer("1.0.0-beta", than: "1.0.0"))
    }

    @Test(arguments: ["", "beta", "v1.0.0"])
    func aVersionWithoutALeadingNumberIsNeverNewer(version: String) {
        #expect(!PluginVersion.isNewer(version, than: "1.0.0"))
        #expect(!PluginVersion.isNewer("1.0.0", than: version))
    }
}
