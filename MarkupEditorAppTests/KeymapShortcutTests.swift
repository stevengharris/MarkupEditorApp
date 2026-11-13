//
//  KeymapShortcutTests.swift
//  MarkupEditorAppTests

import AppKit
import Testing
@testable import MarkupEditorApp
import KeyboardShortcuts
import MarkupEditor

// The expectations assume a US ASCII-capable keyboard layout, since specs are resolved against the current layout.
@MainActor
struct KeymapShortcutTests {

    private var bundledSpecs: [String] {
        KeymapConfig().bindings.values.flatMap { $0.map(\.spec) }.filter { !$0.isEmpty }
    }

    @Test func everyBundledSpecRoundTripsToItself() throws {
        #expect(!bundledSpecs.isEmpty)
        for spec in bundledSpecs {
            let shortcut = try #require(KeymapShortcut.shortcut(from: spec), Comment(rawValue: spec))
            #expect(KeymapShortcut.spec(from: shortcut) == spec, Comment(rawValue: spec))
        }
    }

    @Test func aShiftedPunctuationCharacterStandsForShift() throws {
        let shortcut = try #require(KeymapShortcut.shortcut(from: "Mod->"))
        #expect(shortcut.modifiers == [.command, .shift])
        #expect(shortcut.key == .period)
    }

    @Test func punctuationRecordedWithShiftIsSavedAsTheShiftedCharacter() {
        let shortcut = KeyboardShortcuts.Shortcut(.period, modifiers: [.command, .shift])
        #expect(KeymapShortcut.spec(from: shortcut) == "Mod->")
        #expect(KeymapShortcut.spec(from: .init(.comma, modifiers: [.command, .shift])) == "Mod-<")
    }

    @Test func lettersAndDigitsKeepAnExplicitShift() {
        #expect(KeymapShortcut.spec(from: .init(.g, modifiers: [.control, .shift])) == "Ctrl-Shift-g")
        #expect(KeymapShortcut.spec(from: .init(.three, modifiers: [.control, .shift])) == "Ctrl-Shift-3")
    }

    @Test func modifiersAreWrittenInTheOrderTheBundledKeymapUses() {
        let all: NSEvent.ModifierFlags = [.shift, .control, .option, .command]
        #expect(KeymapShortcut.spec(from: .init(.b, modifiers: all)) == "Mod-Alt-Ctrl-Shift-b")
    }

    @Test func differentSpellingsOfOneKeyPressNormalizeAlike() {
        #expect(KeymapShortcut.normalized("Mod->") == KeymapShortcut.normalized("Mod-Shift-."))
        #expect(KeymapShortcut.normalized("Mod-Z") == KeymapShortcut.normalized("Mod-Shift-z"))
        #expect(KeymapShortcut.normalized("Mod-b") != KeymapShortcut.normalized("Mod-Shift-b"))
    }

    @Test func aSpecThatCannotBeResolvedIsNilAndNormalizesToItself() {
        for spec in ["", "Mod-Enter", "Mod-"] {
            #expect(KeymapShortcut.shortcut(from: spec) == nil, Comment(rawValue: spec))
        }
        #expect(KeymapShortcut.normalized("Mod-Enter") == "Mod-Enter")
    }

    @Test func aKeyWithNoPrintableCharacterHasNoSpec() {
        #expect(KeymapShortcut.spec(from: .init(.f5, modifiers: [.command])) == nil)
    }

    @Test func displayUsesMenuNotationWithTheSpecsKeyCharacter() {
        #expect(KeymapShortcut.display(spec: "Mod-Shift-z") == "⇧⌘Z")
        #expect(KeymapShortcut.display(spec: "Mod->") == "⌘>")
    }
}
