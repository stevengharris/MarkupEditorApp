//
//  ShortcutsInfoView.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// The Shortcuts section of the Tools tab: the Shortcuts chosen for File > Run Shortcut, with add and remove.
/// It is a disclosure group, so it is placed in the list of `ToolsInfoView`.
struct ShortcutsInfoView: View {
    private let model = ShortcutsModel.shared
    @State private var expanded = true
    @State private var showHelp = false
    @State private var showPicker = false
    @State private var selection: String?
    @State private var removeRequest: String?
    @State private var showRemove = false

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            if let error = model.chosenError {
                Text(error)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.leading, indent)
            }
            if model.chosen.isEmpty {
                Text("None")
                    .foregroundStyle(.secondary)
                    .padding(.leading, indent)
            } else {
                ForEach(model.chosen, id: \.self) { name in
                    row(name)
                        .contentShape(Rectangle())
                        .onTapGesture { selection = name }
                        .listRowBackground(name == selection ? Color(nsColor: .unemphasizedSelectedContentBackgroundColor) : Color.clear)
                        .contextMenu {
                            Button("Open in Shortcuts") { open(name) }
                            Button("Remove…") { requestRemove(name) }
                        }
                        .padding(.leading, indent)
                }
            }
        } label: {
            header
                .padding(.leading, -InfoSectionLayout.chevronInset)
        }
        .confirmationDialog(
            "Remove Shortcut?",
            isPresented: $showRemove,
            titleVisibility: .visible,
            presenting: removeRequest
        ) { name in
            Button("Remove", role: .destructive) {
                showRemove = false
                removeRequest = nil
                Task { remove(name) }
            }
            Button("Cancel", role: .cancel) { removeRequest = nil }
        } message: { name in
            Text("Remove Shortcut \"\(name)\"? This does not remove the Shortcut from your computer, only from the menu and this list.")
        }
        .task { await model.reloadLibrary() }
    }

    /// Where the rows start, so they line up under the heading.
    private var indent: CGFloat { -(InfoSectionLayout.disclosureIndent + InfoSectionLayout.chevronInset) }

    private var header: some View {
        HStack(spacing: 6) {
            Label("Shortcuts", systemImage: "bolt")
                .font(.title3)
            Button("About Shortcuts", systemImage: "info.circle") { showHelp.toggle() }
                .labelStyle(.iconOnly)
                .buttonStyle(.plain)
                .popover(isPresented: $showHelp, arrowEdge: .bottom) { help }
            Spacer()
            Button {
                if let selection { requestRemove(selection) }
            } label: {
                Image(systemName: "minus")
            }
            .buttonStyle(SquareIconButtonStyle())
            .disabled(selection == nil)
            .help("Remove the selected Shortcut from the list")
            .accessibilityLabel("Remove the selected Shortcut")
            Button {
                Task { await model.reloadLibrary() }
                showPicker = true
            } label: {
                Image(systemName: "plus")
            }
            .buttonStyle(SquareIconButtonStyle())
            .help("Choose a Shortcut")
            .accessibilityLabel("Choose a Shortcut")
            .popover(isPresented: $showPicker, arrowEdge: .bottom) {
                ShortcutPickerView(library: model.library, errorMessage: model.errorMessage, isChosen: model.isChosen) { name in
                    model.choose(name)
                    showPicker = false
                }
            }
        }
    }

    private func row(_ name: String) -> some View {
        let missing = model.isMissing(name)
        return HStack {
            Text(missing ? "\(name) (not found)" : name)
                .foregroundStyle(missing ? .secondary : .primary)
            Spacer()
        }
        .help(missing ? "This Shortcut is not in your Shortcuts library" : "")
        .accessibilityElement(children: .combine)
    }

    private func requestRemove(_ name: String) {
        removeRequest = name
        showRemove = true
    }

    private func remove(_ name: String) {
        model.remove(name)
        if selection == name { selection = nil }
    }

    private func open(_ name: String) {
        if let url = ShortcutLink.openShortcutURL(name: name) { NSWorkspace.shared.open(url) }
    }

    private var help: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Shortcuts")
                .font(.headline)
            ForEach(helpParagraphs, id: \.self) { paragraph in
                Text(Self.styled(paragraph))
                    .font(.callout)
                    .fixedSize(horizontal: false, vertical: true)
            }
            sample
        }
        .padding()
        .frame(width: 340)
    }

    /// A ready-made Shortcut and a way to read the script it runs. Adding it opens the Shortcuts import dialog;
    /// the user still chooses it here.
    private var sample: some View {
        HStack {
            Button("Add Sample", action: addSampleShortcut)
                .disabled(sampleShortcutURL == nil)
            Button("View Script", action: viewSampleScript)
                .disabled(sampleScript.isEmpty)
        }
    }

    /// `paragraph` with its inline Markdown, such as code spans, applied and its line breaks kept.
    private static func styled(_ paragraph: String) -> AttributedString {
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .inlineOnlyPreservingWhitespace)
        return (try? AttributedString(markdown: paragraph, options: options)) ?? AttributedString(paragraph)
    }

    /// The help text, one paragraph per blank-line-separated block of shortcuts-help.txt.
    private var helpParagraphs: [String] {
        let text = Bundle.main.url(forResource: "shortcuts-help", withExtension: "txt")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) } ?? ""
        return text.components(separatedBy: "\n\n")
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
    }

    private var sampleShortcutURL: URL? {
        Bundle.main.url(forResource: "Open in Browser", withExtension: "shortcut")
    }

    private var sampleScript: String {
        Bundle.main.url(forResource: "open-in-browser", withExtension: "sh")
            .flatMap { try? String(contentsOf: $0, encoding: .utf8) }?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
    }

    /// Opens a plain-text copy of the sample script in a text window, so edits never touch the app bundle.
    private func viewSampleScript() {
        let copy = FileManager.default.temporaryDirectory.appendingPathComponent("Open in Browser script.txt")
        do {
            try sampleScript.write(to: copy, atomically: true, encoding: .utf8)
        } catch {
            EditLog.shared.warning("The sample script could not be opened: \(error.localizedDescription)", category: "Shortcuts")
            return
        }
        if let editor = NSWorkspace.shared.urlForApplication(withBundleIdentifier: "com.apple.TextEdit") {
            NSWorkspace.shared.open([copy], withApplicationAt: editor, configuration: NSWorkspace.OpenConfiguration())
        } else {
            NSWorkspace.shared.open(copy)
        }
    }

    private func addSampleShortcut() {
        if let url = sampleShortcutURL { NSWorkspace.shared.open(url) }
    }
}
