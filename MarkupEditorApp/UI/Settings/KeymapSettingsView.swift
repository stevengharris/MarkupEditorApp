//
//  KeymapSettingsView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/29/26.
//

import SwiftUI
import KeyboardShortcuts
import MarkupEditor

struct KeymapSettingsView: View {

    /// UserDefaults key for the selected segment.
    static let settingGroupKey = "keymapSettingGroup"

    enum SettingGroup: String, CaseIterable, Identifiable {
        case document = "Document"
        case insert = "Insert"
        case style = "Style"
        case format = "Format"
        var id: Self { self }
    }

    enum Action {
        enum Document: String, CaseIterable, Identifiable {
            case undo, redo, search, source
            var label: String {
                switch self {
                case .undo: "Undo:"
                case .redo: "Redo:"
                case .search: "Find:"
                case .source: "Toggle Source:"
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
            case p, h1, h2, h3, h4, h5, h6, bullet, number, indent, outdent
            var label: String {
                switch self {
                case .bullet: "Bullets:"
                case .number: "Numbers:"
                case .indent: "Indent:"
                case .outdent: "Outdent:"
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
    /// For each changed action, the bindings before the change and whether the change is currently undone.
    @State private var history: [String: (previous: [String], undone: Bool)] = [:]
    /// The binding being recorded, if any. Only one is at a time.
    @State private var editingTarget: (action: String, index: Int)?
    @AppStorage(Self.settingGroupKey) private var settingGroup: SettingGroup = .document

    /// The bindings used by more than one action, in menu notation. Spellings of one key press are the same binding.
    private var conflicts: [String] {
        var actionForKey: [String: String] = [:]
        var duplicates: [String: String] = [:]
        for action in actions {
            let unique = Set((bindingStrings[action] ?? []).filter { !$0.isEmpty })
            for spec in unique {
                let key = KeymapShortcut.normalized(spec)
                if let prior = actionForKey[key], prior != action {
                    duplicates[key] = KeymapShortcut.display(spec: spec)
                } else {
                    actionForKey[key] = action
                }
            }
        }
        return duplicates.values.sorted()
    }

    var body: some View {
        Spacer()
        VStack(spacing: 0) {
            if !conflicts.isEmpty {
                HStack(spacing: 6) {
                    Image(systemName: "exclamationmark.triangle.fill")
                        .foregroundStyle(.yellow)
                    Text("Binding conflict: \(conflicts.joined(separator: ", "))")
                        .font(.caption)
                }
                .padding()
            }
            Picker("", selection: $settingGroup) {
                ForEach(SettingGroup.allCases) { info in
                    Text(info.rawValue)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .tag(info)
                }
            }
            .pickerStyle(.segmented)

            Text("Select an item to edit. Then, press the hotkey combo you want or use the clear button to remove it. Use + to add multiple bindings. The first binding appears in menus.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .padding()

            switch settingGroup {
            case .document:
                Form {
                    ForEach(Action.Document.allCases) { action in
                        actionRow(key: action.rawValue, label: action.label)
                    }
                    // Suggestions follow the document actions only while assistants are on, as in the Edit menu.
                    if AppControl.shared.isEnabled {
                        LabeledContent("Suggestions:") { Text("When active") }
                            .padding(.top, 12)
                        ForEach(Action.Suggestions.allCases) { action in
                            actionRow(key: action.rawValue, label: action.label)
                        }
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
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)   // Fill parent
        .background {
            // A background only receives taps that miss every control in front of it.
            Color.clear
                .contentShape(Rectangle())
                .onTapGesture {
                    NSApp.keyWindow?.makeFirstResponder(nil)
                    editingTarget = nil
                }
        }
        // The view shows its own conflict banner, so the recorder need not block keys the menu already uses.
        .keyboardShortcutsConflictPolicy(.init(menuItem: .allow))
        .onAppear { loadConfig() }
        Spacer()

    }

    private func actionRow(key: String, label: String) -> some View {
        KeymapActionRow(
            label: label,
            specs: Binding(
                get: { bindingStrings[key] ?? [""] },
                set: { new in
                    let old = bindingStrings[key] ?? [""]
                    // A list with an empty entry beside others is a step in adding a binding, not a state to return to.
                    if old != new, !(old.count > 1 && old.contains("")) {
                        history[key] = (old, false)
                    }
                    bindingStrings[key] = new
                }
            ),
            history: swapState(for: key),
            onSwap: { swapHistory(for: key) },
            onSave: save,
            editing: Binding(
                get: { editingTarget?.action == key ? editingTarget?.index : nil },
                set: { index in
                    if let index { editingTarget = (key, index) } else if editingTarget?.action == key { editingTarget = nil }
                }
            )
        )
    }

    /// Whether the action has a change to undo or redo, and which one.
    private func swapState(for key: String) -> KeymapActionRow.SwapState? {
        // An empty entry is a binding not yet recorded, so it does not count as a change.
        func recorded(_ specs: [String]) -> [String] { specs.filter { !$0.isEmpty } }
        guard let entry = history[key], recorded(entry.previous) != recorded(bindingStrings[key] ?? [""]) else { return nil }
        return entry.undone ? .redo : .undo
    }

    /// Exchanges the action's bindings with the stored ones, so a second press reverses the first.
    private func swapHistory(for key: String) {
        guard let entry = history[key] else { return }
        let current = bindingStrings[key] ?? [""]
        bindingStrings[key] = entry.previous
        history[key] = (current, !entry.undone)
        editingTarget = nil
        save()
    }

    private func loadConfig() {
        guard !loaded else { return }
        loaded = true
        actions =
            Action.Document.allCases.map(\.rawValue) +
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

/// Makes the recorder next to it the first responder once it is in a window, and calls `onEnd` when it stops being
/// the first responder. The recorder does not take initial focus itself, and SwiftUI focus does not reach it.
private struct RecorderFocus: NSViewRepresentable {
    let onEnd: () -> Void

    func makeCoordinator() -> Coordinator { Coordinator() }

    func makeNSView(context: Context) -> NSView { NSView() }

    func updateNSView(_ view: NSView, context: Context) {
        let coordinator = context.coordinator
        coordinator.onEnd = onEnd
        guard !coordinator.started else { return }
        coordinator.started = true
        DispatchQueue.main.async { [weak view, weak coordinator] in
            guard let view, let coordinator, let window = view.window else { return }
            var ancestor = view.superview
            while let current = ancestor {
                if let recorder = Self.recorder(in: current) {
                    window.makeFirstResponder(recorder)
                    coordinator.watch(recorder, in: window)
                    return
                }
                ancestor = current.superview
            }
        }
    }

    private static func recorder(in view: NSView) -> KeyboardShortcuts.RecorderCocoa? {
        if let recorder = view as? KeyboardShortcuts.RecorderCocoa { return recorder }
        for subview in view.subviews {
            if let recorder = recorder(in: subview) { return recorder }
        }
        return nil
    }

    final class Coordinator {
        var onEnd: () -> Void = {}
        var started = false
        private var observation: NSKeyValueObservation?
        private weak var window: NSWindow?

        /// Watches the window's first responder. The recorder is active while it, or the field editor it uses, holds focus.
        func watch(_ recorder: KeyboardShortcuts.RecorderCocoa, in window: NSWindow) {
            guard isActive(window.firstResponder, recorder) else { return }
            nonisolated(unsafe) let recorder = recorder
            self.window = window
            observation = window.observe(\.firstResponder) { [weak self] _, _ in
                MainActor.assumeIsolated {
                    guard let self, !self.isActive(self.window?.firstResponder, recorder) else { return }
                    self.observation = nil
                    self.onEnd()
                }
            }
        }

        private func isActive(_ responder: NSResponder?, _ recorder: NSView) -> Bool {
            responder === recorder || (responder as? NSText)?.delegate === recorder
        }
    }
}

private struct KeymapActionRow: View {
    let label: String
    @Binding var specs: [String]
    let history: SwapState?
    let onSwap: () -> Void
    let onSave: () -> Void

    /// What the swap button would do now.
    enum SwapState { case undo, redo }

    /// The label height of the add and remove buttons, the same as the Log tab's header buttons.
    private static let buttonContentHeight: CGFloat = 16

    /// The binding being recorded; the others show as text.
    @Binding var editing: Int?

    var body: some View {
        LabeledContent(label) {
            VStack(alignment: .trailing) {
                ForEach(specs.indices, id: \.self) { index in
                    HStack {
                        field(at: index)
                        // Only the first row shows the buttons; the others reserve their space so the fields line up.
                        if index == 0 { controls } else { controls.hidden() }
                    }
                }
            }
        }
        .onChange(of: editing) { old, new in dropEmptyBinding(at: old, whileEditing: new) }
    }

    private var controls: some View {
        HStack {
            Button { specs.append(""); editing = specs.count - 1 } label: {
                Label("Add a binding", systemImage: "plus")
                    .labelStyle(.iconOnly)
                    .frame(width: Self.buttonContentHeight, height: Self.buttonContentHeight)
            }
            .help("Add a binding")
            .disabled(specs.last?.isEmpty ?? false)
            Button(action: onSwap) {
                Label(history == .redo ? "Redo" : "Undo", systemImage: history == .redo ? "arrow.uturn.forward" : "arrow.uturn.backward")
                    .labelStyle(.iconOnly)
                    .frame(width: Self.buttonContentHeight, height: Self.buttonContentHeight)
            }
            .help(history == .redo ? "Redo the change to these bindings" : "Undo the change to these bindings")
            .disabled(history == nil)
            .opacity(history == nil ? 0 : 1)
        }
    }

    /// An empty binding that is no longer being recorded goes away, unless it is the only one.
    private func dropEmptyBinding(at index: Int?, whileEditing current: Int?) {
        guard let index, index < specs.count, specs[index].isEmpty, specs.count > 1 else { return }
        specs.remove(at: index)
        if let current, current > index { editing = current - 1 }
    }

    /// The spec as text, a recorder while it is being edited, or the raw spec when it names a key the recorder cannot show.
    @ViewBuilder
    private func field(at index: Int) -> some View {
        if specs[index].isEmpty || KeymapShortcut.shortcut(from: specs[index]) != nil {
            if editing == index {
                KeyboardShortcuts.Recorder(shortcut: shortcutBinding(at: index))
                    .shortcutValidation { shortcut in
                        KeymapShortcut.spec(from: shortcut) == nil ? .disallow(reason: "This key cannot be used in a binding.") : .allow
                    }
                    .background(RecorderFocus { editing = nil })
                    .frame(width: 140)
            } else {
                Button { editing = index } label: {
                    Text(specs[index].isEmpty ? "Click to record" : KeymapShortcut.display(spec: specs[index]))
                        .foregroundStyle(specs[index].isEmpty ? .secondary : .primary)
                        .frame(maxWidth: .infinity, minHeight: Self.buttonContentHeight)
                }
                .help("Click, then press the keys for this binding")
                .frame(width: 140)
            }
        } else {
            HStack {
                Text(specs[index]).foregroundStyle(.secondary)
                Button {
                    specs.remove(at: index)
                    onSave()
                } label: { Image(systemName: "xmark.circle") }
                    .buttonStyle(.borderless)
                    .help("Remove this binding. It cannot be shown or changed here.")
            }
            .frame(width: 140)
        }
    }

    private func shortcutBinding(at index: Int) -> Binding<KeyboardShortcuts.Shortcut?> {
        Binding(
            get: { index < specs.count ? KeymapShortcut.shortcut(from: specs[index]) : nil },
            set: { shortcut in
                guard index < specs.count else { return }
                if let shortcut {
                    guard let spec = KeymapShortcut.spec(from: shortcut) else { return }
                    specs[index] = spec
                } else if specs.count > 1 {
                    specs.remove(at: index)
                } else {
                    specs[index] = ""
                }
                editing = nil
                onSave()
            })
    }
}

#Preview {
    KeymapSettingsView()
}
