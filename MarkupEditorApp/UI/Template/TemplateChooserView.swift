//
//  TemplateChooserView.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

/// The sheet that lists the templates and hands back the one the user picks.
struct TemplateChooserView: View {
    let library: UserLibrary
    let onChoose: (UserLibraryItem) -> Void
    let onCancel: () -> Void

    @State private var items: [UserLibraryItem] = []
    @State private var selection: UserLibraryItem.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("New from Template")
                .font(.headline)
            if items.isEmpty {
                ContentUnavailableView("No Templates", systemImage: "doc.on.doc")
                    .frame(maxWidth: .infinity, minHeight: 160)
            } else {
                List(items, selection: $selection) { item in
                    VStack(alignment: .leading, spacing: 2) {
                        Text(item.manifest.name)
                        Text(item.manifest.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 2)
                    .tag(item.id)
                }
                .contextMenu(forSelectionType: UserLibraryItem.ID.self) { _ in
                } primaryAction: { ids in
                    if let item = items.first(where: { ids.contains($0.id) }) { onChoose(item) }
                }
                .frame(height: 280)
            }
            HStack {
                Spacer()
                Button("Cancel", role: .cancel, action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Choose") {
                    if let selectedItem { onChoose(selectedItem) }
                }
                .keyboardShortcut(.defaultAction)
                .disabled(selectedItem == nil)
            }
        }
        .padding()
        .frame(width: 420)
        .onAppear {
            items = library.items()
            selection = items.first?.id
        }
    }

    private var selectedItem: UserLibraryItem? {
        items.first { $0.id == selection }
    }
}
