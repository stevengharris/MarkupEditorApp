//
//  ShortcutPickerView.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// Lists the user's Shortcuts as the Shortcuts app does: those in no folder first, then a collapsible section
/// per folder. Choosing one calls `onChoose`.
struct ShortcutPickerView: View {
    let library: ShortcutLibrary?
    let errorMessage: String?
    let isChosen: (String) -> Bool
    let onChoose: (String) -> Void

    @State private var expandedFolders: Set<String> = []

    var body: some View {
        Group {
            if let library {
                if library.isEmpty {
                    message("No Shortcuts found.")
                } else {
                    list(library)
                }
            } else if let errorMessage {
                message(errorMessage)
            } else {
                ProgressView().controlSize(.small).padding()
            }
        }
        .frame(width: 280, height: 320)
    }

    private func list(_ library: ShortcutLibrary) -> some View {
        List {
            ForEach(library.unfiled) { entry in row(entry) }
            ForEach(library.folders.filter { !$0.shortcuts.isEmpty }) { folder in
                DisclosureGroup(isExpanded: binding(for: folder.id)) {
                    ForEach(folder.shortcuts) { entry in row(entry) }
                } label: {
                    Label(folder.name, systemImage: "folder")
                }
            }
        }
        .listStyle(.plain)
    }

    private func row(_ entry: ShortcutEntry) -> some View {
        let chosen = isChosen(entry.name)
        return Button {
            onChoose(entry.name)
        } label: {
            HStack {
                Text(entry.name)
                Spacer()
                if chosen { Image(systemName: "checkmark").foregroundStyle(.secondary) }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(chosen)
        .accessibilityLabel(chosen ? "\(entry.name), already chosen" : entry.name)
    }

    private func message(_ text: String) -> some View {
        Text(text)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .padding()
            .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private func binding(for folder: String) -> Binding<Bool> {
        Binding(
            get: { expandedFolders.contains(folder) },
            set: { if $0 { expandedFolders.insert(folder) } else { expandedFolders.remove(folder) } }
        )
    }
}
