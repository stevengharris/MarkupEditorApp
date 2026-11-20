//
//  ShortcutListParserTests.swift
//  MarkupEditorAppLibTests
//

import Testing
@testable import MarkupEditorAppLib

struct ShortcutListParserTests {

    private let id1 = "9F99F48C-F878-4028-A123-D1F5087D65E5"
    private let id2 = "D69B0276-27D0-42B0-9A98-7B6EA8655CF6"

    @Test func aLineIsANameAndItsIdentifier() {
        let entries = ShortcutListParser.entries(from: "Open in Browser (\(id1))\nSpike State (\(id2))\n")
        #expect(entries == [ShortcutEntry(name: "Open in Browser", identifier: id1), ShortcutEntry(name: "Spike State", identifier: id2)])
    }

    @Test func parenthesesInANameStayInTheName() {
        let entries = ShortcutListParser.entries(from: "Resize (small) (\(id1))")
        #expect(entries == [ShortcutEntry(name: "Resize (small)", identifier: id1)])
    }

    @Test func aNameThatLooksLikeAnIdentifierKeepsItsOwnIdentifierLast() {
        let entries = ShortcutListParser.entries(from: "Copy (\(id2)) (\(id1))")
        #expect(entries == [ShortcutEntry(name: "Copy (\(id2))", identifier: id1)])
    }

    @Test func blankLinesAndWindowsLineEndingsAreIgnored() {
        let entries = ShortcutListParser.entries(from: "\r\nA (\(id1))\r\n\r\nB (\(id2))\r\n")
        #expect(entries.map(\.name) == ["A", "B"])
    }

    @Test func aLineWithoutAnIdentifierIsSkipped() {
        let entries = ShortcutListParser.entries(from: "No identifier here\nA (\(id1))\nBroken (not-a-uuid)")
        #expect(entries.map(\.name) == ["A"])
    }

    @Test func lowercaseIdentifiersAndUnicodeNamesParse() {
        let lower = id1.lowercased()
        let entries = ShortcutListParser.entries(from: "Café ☕ (\(lower))")
        #expect(entries == [ShortcutEntry(name: "Café ☕", identifier: lower)])
    }

    @Test func spacesAroundALineAreTrimmedButNotInsideTheName() {
        let entries = ShortcutListParser.entries(from: "   Two  Words (\(id1))   ")
        #expect(entries == [ShortcutEntry(name: "Two  Words", identifier: id1)])
    }

    @Test func emptyOutputIsNoEntries() {
        #expect(ShortcutListParser.entries(from: "").isEmpty)
        #expect(ShortcutListParser.entries(from: "\n\n").isEmpty)
    }
}
