//
//  ClientIdentityTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct ClientIdentityTests {

    @Test func theOutermostAppBundleIsFoundInAHelperPath() {
        let helper = "/Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper"
        #expect(ClientIdentity.outermostAppBundle(containing: helper) == "/Applications/Claude.app")
        #expect(ClientIdentity.outermostAppBundle(containing: "/Applications/Claude.app/Contents/MacOS/Claude") == "/Applications/Claude.app")
    }

    @Test func aPathOutsideAnyAppBundleHasNone() {
        #expect(ClientIdentity.outermostAppBundle(containing: "/usr/local/bin/node") == nil)
        #expect(ClientIdentity.outermostAppBundle(containing: "/Users/u/apps/tool") == nil)
        #expect(ClientIdentity.outermostAppBundle(containing: "/Users/u/My.application/x") == nil)
    }

    @Test func aPlainProcessIsDescribedByItsExecutable() throws {
        let identity = try #require(ClientIdentity.describe(pid: 1))   // launchd
        #expect(identity.path == "/sbin/launchd")
        #expect(identity.name == "launchd")
        #expect(identity.bundleIdentifier == nil)
        #expect(identity.key == "||/sbin/launchd")
    }

    @Test func aProcessInsideAnAppIsDescribedAsTheApp() throws {
        let identity = try #require(ClientIdentity.describe(pid: getpid()))
        #expect(!identity.name.isEmpty)
        #expect(!identity.path.isEmpty)
        // The test runner lives inside Xcode.app, so it reports as that app.
        if identity.path.hasSuffix(".app") { #expect(identity.bundleIdentifier != nil) }
    }

    @Test func theParentOfThisProcessIsDescribed() {
        #expect(ClientIdentity.ofParentProcess() != nil)
    }

    @Test func aMissingProcessHasNoIdentity() {
        #expect(ClientIdentity.describe(pid: 999_999) == nil)
    }
}
