//
//  AddItemView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/1/26.
//

import SwiftUI

struct AddItemView: View {
    @Binding var isPresented: Bool
    private let title: String
    private let namePrompt: String
    private let valuePrompt: String
    @State private var name = ""
    @State private var value = ""
    var onSubmit: (String, String) -> Void
    
    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text(title)
                .font(.headline)
            TextField(namePrompt, text: $name)
            TextField(valuePrompt, text: $value)
            HStack {
                Spacer()
                Button("Cancel", role: .cancel) { isPresented = false }
                    .keyboardShortcut(.escape, modifiers: [])
                Button("OK") {
                    onSubmit(name, value)
                    isPresented = false
                }
                .keyboardShortcut(.return, modifiers: [])
                .disabled(name.isEmpty)
            }
        }
        .padding()
        .frame(width: 300)
    }
    
    init(isPresented: Binding<Bool>, title: String? = nil, namePrompt: String? = nil, valuePrompt: String? = nil, onSubmit: @escaping (String, String) -> Void) {
        _isPresented = isPresented
        self.title = title ?? "Add Item"
        self.namePrompt = namePrompt ?? "Name"
        self.valuePrompt = valuePrompt ?? "Value"
        self.onSubmit = onSubmit
    }
}

#Preview {
    AddItemView(isPresented: .constant(true), title: "Add Metadata Item", namePrompt: "Key", valuePrompt: "Value", onSubmit: {_, _ in return })
}
