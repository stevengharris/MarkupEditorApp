//
//  AddTemplateView.swift
//  MarkupEditorApp
//

import SwiftUI

/// Asks for the name and description of a template about to be added or saved.
struct AddTemplateView: View {
    let title: String
    let detail: String
    let confirmTitle: String
    @State var name: String
    @State var description: String
    let onConfirm: (String, String) -> Void
    let onCancel: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title)
                .font(.headline)
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
            TextField("Name", text: $name)
            TextField("Description", text: $description)
            HStack {
                Spacer()
                Button("Cancel", role: .cancel, action: onCancel)
                    .keyboardShortcut(.cancelAction)
                Button(confirmTitle) { onConfirm(name, description) }
                    .keyboardShortcut(.defaultAction)
                    .disabled(name.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
            }
        }
        .padding()
        .frame(width: 360)
    }
}
