//
//  KeymapShortcut.swift
//  MarkupEditorApp
//

import AppKit
import Carbon.HIToolbox
import KeyboardShortcuts
import MarkupEditor

/// Converts between keymap spec strings and the shortcuts the recorder works with.
///
/// A spec is a modifier prefix and a key character: `Mod-b`, `Mod-Shift-z`, `Ctrl-Shift-3`. A shifted
/// punctuation character stands for Shift, so `Mod->` is Shift-Command-period on a US keyboard. Characters are
/// resolved against the current ASCII-capable keyboard layout.
enum KeymapShortcut {

    /// The shortcut a spec stands for, or nil when the spec is empty or names a key this layout cannot produce.
    static func shortcut(from spec: String) -> KeyboardShortcuts.Shortcut? {
        guard !spec.isEmpty else { return nil }
        let binding = KeyBinding.from(spec: spec)
        guard binding.keyEquivalent.count == 1, let character = binding.keyEquivalent.first else { return nil }
        let table = Layout.current
        var modifiers = binding.modifierMask
        let code: Int
        if let plain = table.unshifted[character] {
            code = plain
        } else if let lower = character.lowercased().first, lower != character, let plain = table.unshifted[lower] {
            code = plain
            modifiers.insert(.shift)
        } else if let shifted = table.shifted[character] {
            code = shifted
            modifiers.insert(.shift)
        } else {
            return nil
        }
        return KeyboardShortcuts.Shortcut(KeyboardShortcuts.Key(rawValue: code), modifiers: modifiers)
    }

    /// The spec for a recorded shortcut, or nil when its key has no printable character, such as a function key.
    /// Punctuation recorded with Shift is written as the shifted character; letters and digits keep an explicit Shift.
    static func spec(from shortcut: KeyboardShortcuts.Shortcut) -> String? {
        let table = Layout.current
        guard let plain = table.character(forKeyCode: shortcut.carbonKeyCode, shift: false) else { return nil }
        let modifiers = shortcut.modifiers
        var shift = modifiers.contains(.shift)
        var key = plain
        if shift, !plain.isLetter, !plain.isNumber, let shifted = table.character(forKeyCode: shortcut.carbonKeyCode, shift: true) {
            key = shifted
            shift = false
        }
        var spec = ""
        if modifiers.contains(.command) { spec += "Mod-" }
        if modifiers.contains(.option) { spec += "Alt-" }
        if modifiers.contains(.control) { spec += "Ctrl-" }
        if shift { spec += "Shift-" }
        return spec + String(key).lowercased()
    }

    /// A form of the spec that is the same for every spelling of one key press, or the spec itself when it
    /// cannot be resolved. `Mod->` and `Mod-Shift-.` give the same value.
    static func normalized(_ spec: String) -> String {
        guard let shortcut = shortcut(from: spec) else { return spec }
        return "\(shortcut.carbonKeyCode)/\(shortcut.carbonModifiers)"
    }

    /// The spec in menu notation, with the key character as the spec writes it: `⇧⌘Z`, `⌘>`.
    static func display(spec: String) -> String {
        let binding = KeyBinding.from(spec: spec)
        return binding.modifierMask.ks_symbolicRepresentation + binding.keyEquivalent.uppercased()
    }

    /// The characters each physical key produces, with and without Shift, in one keyboard layout.
    struct Layout {
        let unshifted: [Character: Int]
        let shifted: [Character: Int]
        private let characters: [Int: (plain: Character, shifted: Character?)]

        func character(forKeyCode code: Int, shift: Bool) -> Character? {
            guard let entry = characters[code] else { return nil }
            return shift ? entry.shifted : entry.plain
        }

        private static var cache: (id: String, layout: Layout)?

        /// The layout in use now, rebuilt when the input source changes.
        static var current: Layout {
            guard let source = TISCopyCurrentASCIICapableKeyboardLayoutInputSource()?.takeRetainedValue() else { return Layout(unshifted: [:], shifted: [:], characters: [:]) }
            let id = (TISGetInputSourceProperty(source, kTISPropertyInputSourceID).map { Unmanaged<CFString>.fromOpaque($0).takeUnretainedValue() as String }) ?? ""
            if let cache, cache.id == id { return cache.layout }
            let layout = build(from: source)
            cache = (id, layout)
            return layout
        }

        private init(unshifted: [Character: Int], shifted: [Character: Int], characters: [Int: (plain: Character, shifted: Character?)]) {
            self.unshifted = unshifted
            self.shifted = shifted
            self.characters = characters
        }

        private static func build(from source: TISInputSource) -> Layout {
            guard let data = TISGetInputSourceProperty(source, kTISPropertyUnicodeKeyLayoutData) else {
                return Layout(unshifted: [:], shifted: [:], characters: [:])
            }
            let layoutData = unsafeBitCast(data, to: CFData.self)
            var unshifted: [Character: Int] = [:]
            var shifted: [Character: Int] = [:]
            var characters: [Int: (plain: Character, shifted: Character?)] = [:]
            for code in 0..<128 {
                guard let plain = translate(code, shift: false, layoutData: layoutData) else { continue }
                let upper = translate(code, shift: true, layoutData: layoutData)
                characters[code] = (plain, upper)
                if unshifted[plain] == nil { unshifted[plain] = code }
                if let upper, upper != plain, shifted[upper] == nil { shifted[upper] = code }
            }
            // A character on an unshifted key wins over the same character reached with Shift.
            for character in unshifted.keys { shifted[character] = nil }
            return Layout(unshifted: unshifted, shifted: shifted, characters: characters)
        }

        /// The printable character `code` produces, or nil for a key with none.
        private static func translate(_ code: Int, shift: Bool, layoutData: CFData) -> Character? {
            let layout = unsafeBitCast(CFDataGetBytePtr(layoutData), to: UnsafePointer<UCKeyboardLayout>.self)
            var deadKeys: UInt32 = 0
            var length = 0
            var buffer = [UniChar](repeating: 0, count: 4)
            let status = UCKeyTranslate(
                layout, UInt16(code), UInt16(kUCKeyActionDisplay),
                UInt32(shift ? (shiftKey >> 8) & 0xFF : 0), UInt32(LMGetKbdType()),
                OptionBits(kUCKeyTranslateNoDeadKeysBit), &deadKeys, buffer.count, &length, &buffer)
            guard status == noErr, length == 1,
                  let scalar = Unicode.Scalar(buffer[0]) else { return nil }
            let character = Character(scalar)
            guard character.isLetter || character.isNumber || character.isPunctuation || character.isSymbol else { return nil }
            return character
        }
    }
}
