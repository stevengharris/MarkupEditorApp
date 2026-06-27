//
//  KeymapSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

struct KeymapSettingsView: View {
    private static let actions: [String] = [
        "undo", "redo",
        "link",
        "p", "h1", "h2", "h3", "h4", "h5", "h6",
        "bullet", "number", "indent", "outdent",
        "bold", "italic", "underline", "strikethrough", "code", "subscript", "superscript",
        "search"
    ]

    private static let actionLabels: [String: String] = [
        "undo": "Undo:", "redo": "Redo:",
        "link": "Link:",
        "p": "Normal:", "h1": "H1:", "h2": "H2:", "h3": "H3:", "h4": "H4:", "h5": "H5:", "h6": "H6:",
        "bullet": "Bullets:", "number": "Numbers:", "indent": "Indent:", "outdent": "Outdent:",
        "bold": "Bold:", "italic": "Italic:", "underline": "Underline:",
        "strikethrough": "Strikethrough:", "code": "Code:",
        "subscript": "Subscript:", "superscript": "Superscript:",
        "search": "Search:"
    ]

    @AppStorage(AppConfig.ConfigKey.keymap) private var keymapConfigJSON: String = ""
    @State private var config = KeymapConfig.fromDefaults()
    @State private var bindingStrings: [String: [String]] = [:]
    @State private var loaded = false

    private var conflicts: Set<String> {
        var actionForSpec: [String: String] = [:]
        var duplicates: Set<String> = []
        for action in Self.actions {
            let unique = Set((bindingStrings[action] ?? []).filter { !$0.isEmpty })
            for spec in unique {
                if let prior = actionForSpec[spec], prior != action {
                    duplicates.insert(spec)
                } else {
                    actionForSpec[spec] = action
                }
            }
        }
        return duplicates
    }

    var body: some View {
        if !conflicts.isEmpty {
            HStack(spacing: 6) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundStyle(.yellow)
                Text("Binding conflict: \(conflicts.sorted().joined(separator: ", "))")
                    .font(.caption)
            }
            .padding()
        }
        Text("A binding consists of modifiers and a key, separated by a minus sign. Modifiers are Ctrl(⌃), Alt(⌥), Mod(⌘), and Shift. Separate multiple bindings by a space. The first binding appears in menus. Press Return to apply changes.")
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding()
        Form {
            actionRow("undo")
            actionRow("redo")
            
            actionRow("link")
            
            actionRow("p")
            actionRow("h1")
            actionRow("h2")
            actionRow("h3")
            actionRow("h4")
            actionRow("h5")
            actionRow("h6")
            
            actionRow("bullet")
            actionRow("number")
            
            actionRow("indent")
            actionRow("outdent")
            
            actionRow("bold")
            actionRow("italic")
            actionRow("underline")
            actionRow("strikethrough")
            actionRow("code")
            actionRow("subscript")
            actionRow("superscript")
            
            actionRow("search")
        }
        .formStyle(.columns)
        .frame(maxWidth: .infinity, maxHeight: .infinity)   // Fill parent
        .onAppear { loadConfig() }
        Spacer()
    }

    private func actionRow(_ action: String) -> some View {
        KeymapActionRow(
            label: Self.actionLabels[action] ?? action,
            specs: Binding(
                get: { bindingStrings[action] ?? [""] },
                set: { bindingStrings[action] = $0 }
            ),
            onSave: save
        )
    }

    private func loadConfig() {
        guard !loaded else { return }
        loaded = true
        config = KeymapConfig.fromDefaults()
        for action in Self.actions {
            let rawSpecs = (config.bindings[action] ?? []).map { $0.spec }
            var seen = Set<String>()
            let specs = rawSpecs.filter { seen.insert($0).inserted }
            bindingStrings[action] = specs.isEmpty ? [""] : specs
        }
    }

    private func save() {
        var newBindings: [String: [KeyBinding]] = [:]
        for action in Self.actions {
            let specs = bindingStrings[action] ?? []
            let nonEmpty = specs.filter { !$0.isEmpty }
            if nonEmpty.isEmpty {
                newBindings[action] = [KeyBinding.from(spec: "")]
            } else {
                newBindings[action] = nonEmpty.map { KeyBinding.from(spec: $0) }
            }
        }
        config.bindings = newBindings
        if let json = config.asJSON(), keymapConfigJSON != json {
            keymapConfigJSON = json
        } else {
            assertionFailure("KeymapConfig encoding failed unexpectedly")
        }
    }
}

private struct KeymapActionRow: View {
    let label: String
    @Binding var specs: [String]
    let onSave: () -> Void

    var body: some View {
        
        LabeledContent(label) {
            TextField("", text: keymapBinding())
                .onSubmit { onSave() }
                .frame(width: 160)
        }
    }
    
    func keymapBinding() -> Binding<String> {
        Binding(
            get: {
                specs.joined(separator: " ")
            },
            set: {
                let strings = $0.components(separatedBy: " ")
                specs = strings
            })
    }
}

#Preview {
    KeymapSettingsView()
}
