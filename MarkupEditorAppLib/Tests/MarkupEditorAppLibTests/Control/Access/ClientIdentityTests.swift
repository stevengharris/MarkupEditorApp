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

    @Test func aVersionNumberExecutableIsNamedAfterItsProgram() {
        #expect(ClientIdentity.displayName(forExecutable: "/Users/u/.local/share/claude/versions/2.1.310") == "Claude 2.1.310")
        #expect(ClientIdentity.displayName(forExecutable: "/opt/tool/4.0") == "Tool 4.0")
        #expect(ClientIdentity.displayName(forExecutable: "/usr/local/bin/node") == "node")
        #expect(ClientIdentity.displayName(forExecutable: "/usr/local/bin/python3") == "python3")
        #expect(ClientIdentity.displayName(forExecutable: "/2.1.310") == "2.1.310")
    }

    @Test func interpretersAreRecognized() {
        #expect(ClientIdentity.isInterpreter("/opt/homebrew/bin/node"))
        #expect(ClientIdentity.isInterpreter("/usr/bin/python3.12"))
        #expect(ClientIdentity.isInterpreter("/bin/zsh"))
        #expect(!ClientIdentity.isInterpreter("/usr/local/bin/codex"))
        #expect(!ClientIdentity.isInterpreter("/Users/u/.local/share/claude/versions/2.1.310"))
    }

    @Test func theScriptIsTheFirstArgumentThatIsNotAnOption() {
        #expect(ClientIdentity.scriptArgument(in: ["node", "/opt/x/bin/gemini.js", "--flag"], interpreter: "node") == "/opt/x/bin/gemini.js")
        #expect(ClientIdentity.scriptArgument(in: ["node", "--no-warnings", "/opt/x/cli.js"], interpreter: "node") == "/opt/x/cli.js")
        #expect(ClientIdentity.scriptArgument(in: ["node", "--require", "/opt/hook.js", "/opt/x/cli.js"], interpreter: "node") == "/opt/x/cli.js")
        #expect(ClientIdentity.scriptArgument(in: ["python3", "-m", "agent"], interpreter: "python3") == "agent")
    }

    @Test func inlineCodeAndReplsHaveNoScript() {
        #expect(ClientIdentity.scriptArgument(in: ["node"], interpreter: "node") == nil)
        #expect(ClientIdentity.scriptArgument(in: ["node", "-e", "console.log(1)"], interpreter: "node") == nil)
        #expect(ClientIdentity.scriptArgument(in: ["sh", "-c", "tool --serve"], interpreter: "sh") == nil)
    }

    @Test func aScriptNamesTheProgramAndSeparatesItsApproval() {
        let a = ClientIdentity(name: "gemini-cli (node)", path: "/opt/homebrew/bin/node", script: "/opt/lib/node_modules/@google/gemini-cli/dist/index.js")
        let b = ClientIdentity(name: "other (node)", path: "/opt/homebrew/bin/node", script: "/opt/lib/node_modules/other/index.js")
        let bare = ClientIdentity(name: "node", path: "/opt/homebrew/bin/node")
        #expect(a.key != b.key)
        #expect(a.key != bare.key)
        #expect(bare.key == "||/opt/homebrew/bin/node")
        #expect(ClientIdentity.displayName(forExecutable: "/opt/homebrew/bin/node", script: a.script) == "gemini-cli (node)")
        #expect(ClientIdentity.displayName(forExecutable: "/usr/bin/python3", script: "/home/u/agent/run.py") == "run (python3)")
    }

    @Test func theArgumentBlockOfARunningProcessParses() throws {
        let arguments = try #require(ClientIdentity.processArguments(of: getpid()))
        #expect(!arguments.isEmpty)
    }

    @Test func aScriptRunByAnInterpreterIsNamedAfterTheScript() {
        let identity = ClientIdentity.identity(ofExecutable: "/bin/bash", arguments: ["bash", "/opt/agents/fake-agent.sh"], team: nil)
        #expect(identity.name == "fake-agent (bash)")
        #expect(identity.path == "/bin/bash")
        #expect(identity.script == "/opt/agents/fake-agent.sh")
        #expect(identity.key.hasSuffix("|/opt/agents/fake-agent.sh"))
    }

    @Test func aTruncatedArgumentBlockIsRejected() {
        var block = [UInt8](repeating: 0, count: 4)
        block[0] = 3
        block += Array("/bin/x".utf8) + [0, 0] + Array("x".utf8) + [0]
        #expect(ClientIdentity.parseProcessArguments(block) == nil)
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
