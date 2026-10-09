//
//  ClientAccessTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct ClientAccessTests {

    @Test func accessLevelsOrderFromNoneToWrite() {
        #expect(ClientAccess.readWrite.permits(.read))
        #expect(ClientAccess.readWrite.permits(.readWrite))
        #expect(ClientAccess.read.permits(.read))
        #expect(!ClientAccess.read.permits(.readWrite))
        #expect(!ClientAccess.denied.permits(.read))
        #expect(!ClientAccess.undecided.permits(.read))
    }

    @Test func aClientIsRememberedByBundleIdentifierAndPath() {
        let genuine = ClientIdentity(name: "Claude", path: "/Applications/Claude.app", bundleIdentifier: "com.anthropic.claude")
        let copied = ClientIdentity(name: "Claude", path: "/Users/u/x/Claude.app", bundleIdentifier: "com.anthropic.claude")
        let resigned = ClientIdentity(name: "Claude", path: "/Applications/Claude.app", bundleIdentifier: "com.anthropic.claude", teamIdentifier: "ABCDE12345")
        #expect(genuine.key != copied.key)
        #expect(genuine.key != resigned.key)
        #expect(ClientIdentity(name: "node", path: "/usr/local/bin/node").key != ClientIdentity(name: "node", path: "/opt/node").key)
    }

    @Test func accessThatWasNeverGrantedPermitsNothing() {
        for access in [ClientAccess.undecided, .denied] {
            for required in [ClientAccess.undecided, .denied, .read, .readWrite] {
                #expect(!access.permits(required))
            }
        }
    }
}

struct ClientApprovalStoreTests {

    let defaults = InMemoryDefaults()
    let claude = ClientIdentity(name: "Claude", path: "/A/Claude.app", bundleIdentifier: "com.anthropic.claude")
    let node = ClientIdentity(name: "node", path: "/usr/local/bin/node")

    func store() -> UserDefaultsApprovalStore { UserDefaultsApprovalStore(defaults: defaults) }

    @Test func anUnknownClientIsUndecided() {
        #expect(store().access(for: claude) == .undecided)
    }

    @Test func anApprovalSurvivesANewStoreOnTheSameDefaults() {
        store().save(.readWrite, for: claude)
        #expect(store().access(for: claude) == .readWrite)
        #expect(store().access(for: node) == .undecided)
    }

    @Test func aBlockSurvivesANewStoreAndIsListed() {
        store().save(.denied, for: claude)
        #expect(store().access(for: claude) == .denied)
        #expect(store().approvals().map(\.access) == [.denied])
    }

    @Test func approvingAfterARefusalReplacesIt() {
        let store = store()
        store.save(.denied, for: claude)
        store.save(.read, for: claude)
        #expect(store.access(for: claude) == .read)
    }

    @Test func savingAgainReplacesTheEarlierApproval() {
        let store = store()
        store.save(.read, for: claude)
        store.save(.readWrite, for: claude)
        #expect(store.approvals().count == 1)
        #expect(store.access(for: claude) == .readWrite)
    }

    @Test func revokingForgetsAnApprovalAndARefusal() {
        let store = store()
        store.save(.readWrite, for: claude)
        store.save(.denied, for: node)
        store.revoke(claude)
        store.revoke(node)
        #expect(store.access(for: claude) == .undecided)
        #expect(store.access(for: node) == .undecided)
    }

    @Test func approvalsListByNameWithTheirDecisionDate() {
        let date = Date(timeIntervalSince1970: 1_000_000)
        let store = UserDefaultsApprovalStore(defaults: defaults, now: { date })
        store.save(.read, for: node)
        store.save(.readWrite, for: claude)
        #expect(store.approvals().map(\.client.name) == ["Claude", "node"])
        #expect(store.approvals().allSatisfy { $0.decided == date })
    }

    @Test func aCorruptStoredValueReadsAsNoApprovals() {
        defaults.set(Data("not json".utf8), forKey: UserDefaultsApprovalStore.defaultsKey)
        #expect(store().approvals().isEmpty)
        #expect(store().access(for: claude) == .undecided)
    }
}

@MainActor
struct ControlAuthorizerTests {

    let defaults = InMemoryDefaults()
    let claude = ClientIdentity(name: "Claude", path: "/A/Claude.app", bundleIdentifier: "com.anthropic.claude")
    let prompts = CallLog<String>()

    func authorizer(enabled: Bool = true, answer: ClientAccess = .readWrite, delay: Duration = .zero) -> ControlAuthorizer {
        ControlAuthorizer(
            store: UserDefaultsApprovalStore(defaults: defaults),
            isEnabled: { enabled },
            prompt: { [prompts] client in
                prompts.append(client.name)
                if delay != .zero { try? await Task.sleep(for: delay) }
                return answer
            })
    }

    @Test func everyClientIsDeniedWhileConnectionsAreTurnedOff() async {
        let authorizer = authorizer(enabled: false)
        #expect(await authorizer.access(for: claude, prompting: true) == .denied)
        #expect(prompts.all.isEmpty)
    }

    @Test func aRequestWithNoClientIdentityIsDenied() async {
        #expect(await authorizer().access(for: nil, prompting: true) == .denied)
        #expect(prompts.all.isEmpty)
    }

    @Test func notPromptingReportsUndecidedWithoutAsking() async {
        #expect(await authorizer().access(for: claude, prompting: false) == .undecided)
        #expect(prompts.all.isEmpty)
    }

    @Test func theFirstUseAsksOnceAndRemembersTheAnswer() async {
        let authorizer = authorizer(answer: .read)
        #expect(await authorizer.access(for: claude, prompting: true) == .read)
        #expect(await authorizer.access(for: claude, prompting: true) == .read)
        #expect(prompts.all == ["Claude"])
        #expect(UserDefaultsApprovalStore(defaults: defaults).access(for: claude) == .read)
    }

    @Test func aBlockIsRememberedAcrossAuthorizersUntilRemoved() async {
        #expect(await authorizer(answer: .denied).access(for: claude, prompting: true) == .denied)
        #expect(await authorizer(answer: .readWrite).access(for: claude, prompting: true) == .denied)
        #expect(prompts.all.count == 1)

        UserDefaultsApprovalStore(defaults: defaults).revoke(claude)

        #expect(await authorizer(answer: .read).access(for: claude, prompting: true) == .read)
        #expect(prompts.all.count == 2)
    }

    @Test func requestsThatArriveWhilePromptingShareOnePrompt() async {
        let authorizer = authorizer(answer: .readWrite, delay: .milliseconds(80))
        async let first = authorizer.access(for: claude, prompting: true)
        async let second = authorizer.access(for: claude, prompting: true)
        #expect(await first == .readWrite)
        #expect(await second == .readWrite)
        #expect(prompts.all.count == 1)
    }

    @Test func aStoredApprovalIsUsedWithoutAPromptAcrossAuthorizers() async {
        UserDefaultsApprovalStore(defaults: defaults).save(.read, for: claude)
        #expect(await authorizer().access(for: claude, prompting: true) == .read)
        #expect(prompts.all.isEmpty)
    }
}
