//
//  ShortcutLibraryReaderTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct ShortcutLibraryReaderTests {

    private final class Calls: @unchecked Sendable {
        var arguments: [[String]] = []
    }

    private let u1 = "11111111-1111-1111-1111-111111111111"
    private let u2 = "22222222-2222-2222-2222-222222222222"
    private let f1 = "AAAAAAAA-AAAA-AAAA-AAAA-AAAAAAAAAAAA"
    private let f2 = "BBBBBBBB-BBBB-BBBB-BBBB-BBBBBBBBBBBB"
    private let g1 = "33333333-3333-3333-3333-333333333333"
    private let g2 = "44444444-4444-4444-4444-444444444444"
    private let g3 = "55555555-5555-5555-5555-555555555555"

    private func reader(_ calls: Calls, answers: @escaping @Sendable ([String]) throws -> String) -> ShortcutLibraryReader {
        ShortcutLibraryReader { arguments in
            calls.arguments.append(arguments)
            return try answers(arguments)
        }
    }

    private func standardAnswers() -> @Sendable ([String]) throws -> String {
        let (u1, u2, f1, f2, g1, g2, g3) = (self.u1, self.u2, self.f1, self.f2, self.g1, self.g2, self.g3)
        return { arguments in
            switch arguments {
            case ["list", "--folder-name", "none", "--show-identifiers"]: return "Alpha (\(u1))\nBeta (\(u2))\n"
            case ["list", "--folders", "--show-identifiers"]: return "Starter (\(f1))\nWork (\(f2))\n"
            case ["list", "--folder-name", f1, "--show-identifiers"]: return "Gamma (\(g1))\nDelta (\(g2))\n"
            case ["list", "--folder-name", f2, "--show-identifiers"]: return "Epsilon (\(g3))\n"
            default: throw ShortcutsError.failed(status: 1, message: "unexpected \(arguments)")
            }
        }
    }

    @Test func itReadsUnfiledThenEachFolderInOrder() async throws {
        let calls = Calls()
        let library = try await reader(calls, answers: standardAnswers()).read()
        #expect(library.unfiled.map(\.name) == ["Alpha", "Beta"])
        #expect(library.folders.map(\.name) == ["Starter", "Work"])
        #expect(library.folders[0].shortcuts.map(\.name) == ["Gamma", "Delta"])
        #expect(library.folders[1].shortcuts.map(\.name) == ["Epsilon"])
        #expect(library.folders.map(\.identifier) == [f1, f2])
    }

    @Test func itAsksForFoldersByIdentifierInTheOrderTheyAreListed() async throws {
        let calls = Calls()
        _ = try await reader(calls, answers: standardAnswers()).read()
        #expect(calls.arguments == [
            ["list", "--folder-name", "none", "--show-identifiers"],
            ["list", "--folders", "--show-identifiers"],
            ["list", "--folder-name", f1, "--show-identifiers"],
            ["list", "--folder-name", f2, "--show-identifiers"],
        ])
    }

    @Test func anEmptyLibraryIsEmpty() async throws {
        let library = try await reader(Calls(), answers: { _ in "" }).read()
        #expect(library.unfiled.isEmpty && library.folders.isEmpty)
        #expect(library.isEmpty)
    }

    @Test func aFolderWithNoShortcutsIsKeptEmpty() async throws {
        let f1 = self.f1
        let library = try await reader(Calls(), answers: { arguments in
            arguments.contains("--folders") ? "Empty (\(f1))\n" : ""
        }).read()
        #expect(library.folders.map(\.name) == ["Empty"])
        #expect(library.folders[0].shortcuts.isEmpty)
    }

    @Test func aFailureInAnyCallIsThrown() async {
        let f1 = self.f1
        let failing = reader(Calls()) { arguments in
            if arguments.contains(f1) { throw ShortcutsError.timedOut }
            return arguments.contains("--folders") ? "Starter (\(f1))\n" : ""
        }
        await #expect(throws: ShortcutsError.timedOut) { _ = try await failing.read() }
    }

    @Test func everyShortcutNameIsListedForLookup() async throws {
        let library = try await reader(Calls(), answers: standardAnswers()).read()
        #expect(library.allNames == ["Alpha", "Beta", "Gamma", "Delta", "Epsilon"])
        #expect(library.contains(name: "Delta"))
        #expect(!library.contains(name: "Zeta"))
    }
}
