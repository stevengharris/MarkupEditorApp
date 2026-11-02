//
//  KeymapSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import MarkupEditor

struct KeymapSettingsView: View {

    /// UserDefaults key for the selected segment.
    static let settingGroupKey = "keymapSettingGroup"

    enum SettingGroup: String, CaseIterable, Identifiable {
        case general = "General"
        case insert = "Insert"
        case style = "Style"
        case format = "Format"
        case suggestions = "Suggest"     // Segments share the longest label's width, so keep it short
        var id: Self { self }
    }

    enum Action {
        enum General: String, CaseIterable, Identifiable {
            case undo, redo, bullet, number, indent, outdent, search
            var label: String {
                switch self {
                case .undo: "Undo:"
                case .redo: "Redo:"
                case .bullet: "Bullets:"
                case .number: "Numbers:"
                case .indent: "Indent:"
                case .outdent: "Outdent:"
                case .search: "Search:"
                }
            }
            var id: String { rawValue }
        }
        enum Insert: String, CaseIterable, Identifiable {
            case link, image, table, hrule
            var label: String {
                switch self {
                case .link: "Link:"
                case .image: "Image:"
                case .table: "Table:"
                case .hrule: "Horizontal rule:"
                }
            }
            var id: String { rawValue }
        }
        enum Style: String, CaseIterable, Identifiable {
            case p, h1, h2, h3, h4, h5, h6
            var label: String {
                switch self {
                case .p: "Normal:"
                case .h1: "H1:"
                case .h2: "H2:"
                case .h3: "H3:"
                case .h4: "H4:"
                case .h5: "H5:"
                case .h6: "H6:"
                }
            }
            var id: String { rawValue }
        }
        enum Suggestions: String, CaseIterable, Identifiable {
            case suggestionNext, suggestionPrevious, suggestionAcceptNext, suggestionAcceptPrevious,
                 suggestionRejectNext, suggestionRejectPrevious
            var label: String {
                switch self {
                case .suggestionNext: "Next:"
                case .suggestionPrevious: "Previous:"
                case .suggestionAcceptNext: "Accept+Next:"
                case .suggestionAcceptPrevious: "Accept+Previous:"
                case .suggestionRejectNext: "Reject+Next:"
                case .suggestionRejectPrevious: "Reject+Previous:"
                }
            }
            var id: String { rawValue }
        }
        enum Format: String, CaseIterable, Identifiable {
            case bold, italic, underline, strikethrough, code, `subscript`, superscript
            var label: String {
                switch self {
                case .bold: "Bold:"
                case .italic: "Italic:"
                case .underline: "Underline:"
                case .strikethrough: "Strikethrough:"
                case .code: "Code:"
                case .subscript: "Subscript:"
                case .superscript: "Superscript:"
                }
            }
            var id: String { rawValue }
        }
    }

    @AppStorage(AppConfig.ConfigKey.keymap) private var keymapConfigJSON: String = ""
    @State private var config = KeymapConfig.fromDefaults()
    @State private var bindingStrings: [String: [String]] = [:]
    @State private var actions: [String] = []
    @State private var loaded = false
    @AppStorage(Self.settingGroupKey) private var settingGroup: SettingGroup = .general

    /// The segments to offer: Suggestions only while assistants are on, as in the Edit menu.
    private var visibleGroups: [SettingGroup] {
        SettingGroup.allCases.filter { $0 != .suggestions || AppControl.shared.isEnabled }
    }

    /// The selected segment, or General when the stored one is not offered now.
    private var shownGroup: SettingGroup {
        visibleGroups.contains(settingGroup) ? settingGroup : .general
    }

    private var conflicts: Set<String> {
        var actionForSpec: [String: String] = [:]
        var duplicates: Set<String> = []
        for action in actions {
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
        Spacer()
        VStack(spacing: 0) {
            if !conflicts.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                    Text("Binding conflict: \(conflicts.sorted().joined(separator: ", "))")
                        .font(.caption)
                }
                .padding()
            }
            Picker("", selection: Binding(get: { shownGroup }, set: { settingGroup = $0 })) {
                ForEach(visibleGroups) { info in
                    Text(info.rawValue)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .tag(info)
                }
            }
            .pickerStyle(.segmented)

            Text("Bindings consist of a modifier and keys, separated by a dash. Modifiers are Ctrl(⌃), Alt(⌥), Mod(⌘), and Shift. Separate multiple bindings by a space. The first binding appears in menus. Press Return to apply changes. A shifted character stands for Shift, so Mod-\" is Mod-Shift-' on a US keyboard.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding()

            switch shownGroup {
            case .general:
                Form {
                    ForEach(Action.General.allCases) { action in
                        actionRow(key: action.rawValue, label: action.label)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .insert:
                Form {
                    ForEach(Action.Insert.allCases) { action in
                        actionRow(key: action.rawValue, label: action.label)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .style:
                Form {
                    ForEach(Action.Style.allCases) { action in
                        actionRow(key: action.rawValue, label: action.label)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .format:
                Form {
                    ForEach(Action.Format.allCases) { action in
                        actionRow(key: action.rawValue, label: action.label)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .top)
            case .suggestions:
                Form {
                    ForEach(Action.Suggestions.allCases) { action in
                        actionRow(key: action.rawValue, label: action.label)
                    }
                }
                .frame(maxHeight: .infinity, alignment: .top)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)   // Fill parent
        .onAppear { loadConfig() }
        Spacer()

    }

    private func actionRow(key: String, label: String) -> some View {
        KeymapActionRow(
            label: label,
            specs: Binding(
                get: { bindingStrings[key] ?? [""] },
                set: { bindingStrings[key] = $0 }
            ),
            onSave: save
        )
    }

    private func loadConfig() {
        guard !loaded else { return }
        loaded = true
        actions =
            Action.General.allCases.map(\.rawValue) +
            Action.Insert.allCases.map(\.rawValue) +
            Action.Style.allCases.map(\.rawValue) +
            Action.Format.allCases.map(\.rawValue) +
            Action.Suggestions.allCases.map(\.rawValue)
        config = KeymapConfig.fromDefaults()
        for action in actions {
            let rawSpecs = (config.bindings[action] ?? []).map { $0.spec }
            var seen = Set<String>()
            let specs = rawSpecs.filter { seen.insert($0).inserted }
            bindingStrings[action] = specs.isEmpty ? [""] : specs
        }
    }

    private func save() {
        var newBindings: [String: [KeyBinding]] = [:]
        for action in actions {
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
            NotificationCenter.default.post(name: .keymapDidChange, object: nil)
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
