//
//  ShortcutStatusBodyTests.swift
//  MarkupEditorAppLibTests
//

import Testing
@testable import MarkupEditorAppLib

struct ShortcutStatusBodyTests {

    @Test func theStatusLineIsDroppedFromTheBody() {
        #expect(ShortcutStatus.body(ofResult: "warning: x\nexit=0\n") == "warning: x")
        #expect(ShortcutStatus.body(ofResult: "a\r\nb\r\nexit=3") == "a\nb")
        #expect(ShortcutStatus.body(ofResult: "exit=0") == "")
    }

    @Test func aResultWithoutAStatusLineIsKeptWhole() {
        #expect(ShortcutStatus.body(ofResult: "a\nb\n") == "a\nb")
        #expect(ShortcutStatus.body(ofResult: "") == "")
    }

    @Test func aShortcutsExitCodeErrorYieldsItsCode() {
        #expect(ShortcutStatus.exitCode(forShortcutError: "Exit code: 64") == 64)
        #expect(ShortcutStatus.exitCode(forShortcutError: "  exit code: 1\n") == 1)
    }

    @Test func anyOtherShortcutsErrorYieldsNoCode() {
        #expect(ShortcutStatus.exitCode(forShortcutError: "No such Shortcut") == nil)
        #expect(ShortcutStatus.exitCode(forShortcutError: "Exit code: x") == nil)
        #expect(ShortcutStatus.exitCode(forShortcutError: "") == nil)
        #expect(ShortcutStatus.exitCode(forShortcutError: "abcdefghij42") == nil)
    }
}
