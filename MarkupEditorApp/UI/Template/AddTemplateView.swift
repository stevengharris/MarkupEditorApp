//
//  AddTemplateView.swift
//  MarkupEditorApp
//

import SwiftUI

/// Asks for the name and description of a template about to be added.
struct AddTemplateView: View {
    let pending: String
    @State var name: String
    @State var description: String
    let onAdd: (String, String) -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Add Template")
                .font(.headline)
            Text("From \(pending)")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("Name", text: $name)
            TextField("Description", text: $description)
            HStack {
                Spacer()
                Button("Cancel", role: .cancel, action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button("Add") { onAdd(name, description) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding()
        .frame(width: 360)
    }
}
