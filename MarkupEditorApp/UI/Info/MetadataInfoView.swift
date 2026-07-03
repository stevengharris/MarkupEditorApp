//
//  MetadataInfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI

struct MetadataInfoView: View {
    @Environment(EditLog.self) private var editLog
    @Binding var metadataInfo: [MetadataTuple]
    @FocusState private var focusedKey: String?
    @State private var editingValues: [String: String] = [:]
    @State private var formWidth: CGFloat = 0
    @State private var showAddItem: Bool = false
    @State private var showDeleteItem: Bool = false
    var body: some View {
        Spacer()
        Form {
            if !metadataInfo.isEmpty {
                ForEach(metadataInfo, id: \.key) { item in
                    LabeledContent(item.key + ":") {
                        TextField("", text: Binding(
                            get: { editingValues[item.key] ?? "" },
                            set: { editingValues[item.key] = $0 }
                        ))
                            .focused($focusedKey, equals: item.key)
                            .onSubmit { commitValue(for: item.key) }
                            .lineLimit(1)
                            .truncationMode(.tail)
                            .frame(width: formWidth - 100)
                    }
                    .lineLimit(1)
                    .padding(.horizontal, 8)
                }
            } else {
                Text("Metadata is empty.")
            }
            LabeledContent("") {}
            LabeledContent("") {
                HStack {
                    Button(action: { showAddItem = true }, label: { Image(systemName: "plus.square") })
                    Button(action: { showDeleteItem = true }, label: { Image(systemName: "minus.square") })
                        .disabled(focusedKey == nil)
                    Text("Add or delete metadata items")
                        .lineLimit(1)
                        .font(.subheadline)
                }
                .buttonStyle(.plain)
            }
            .padding(.horizontal, 8)
            Spacer()
        }
        .frame(minWidth: 0, maxWidth: .infinity, maxHeight: .infinity, alignment: .top)   // Fill parent
        .formStyle(.columns)
        .onGeometryChange(for: CGFloat.self, of: \.size.width) { newWidth in
            formWidth = newWidth
        }
        .onAppear { syncEditingValues() }
        .onChange(of: metadataInfo) { syncEditingValues() }
        .sheet(isPresented: $showAddItem) {
            AddItemView(isPresented: $showAddItem, title: "Add Metadata Item", namePrompt: "key", valuePrompt: "value or [value, value...]") { key, string in
                var warnings: [String] = []
                let tuples = YAMLMetadata.parse("\(key): \(string)", warnings: &warnings)
                guard tuples.count == 1 else {
                    editLog.warnings(warnings)
                    return
                }
                let tuple = tuples[0]
                metadataInfo.append(tuple)
            }
        }
        .confirmationDialog(
            "Delete \"\(focusedKey ?? "")\"?",
            isPresented: $showDeleteItem,
            titleVisibility: .visible
        ) {
            Button("Delete", role: .destructive) {
                if let focusedKey, let index = metadataInfo.firstIndex(where: { tuple in
                    tuple.key == focusedKey
                }) {
                    metadataInfo.remove(at: index)
                }
            }
            Button("Cancel", role: .cancel) {}
        }
        Spacer()
    }
    
    func syncEditingValues() {
        for tuple in metadataInfo {
            editingValues[tuple.key] = tuple.value.description
        }
    }

    func commitValue(for key: String) {
        guard let string = editingValues[key],
              let index = metadataInfo.firstIndex(where: { $0.key == key }),
              let newTuple = MetadataTuple.from(key: key, value: string) else { return }
        metadataInfo[index] = newTuple
    }
}

#Preview {
    MetadataInfoView(metadataInfo: (
        Binding<[MetadataTuple]>(
            get: {[
                MetadataTuple(key: "scalar", value: .scalar("value")),
                MetadataTuple(key: "array", value: .array(["value1", "value2"]))
            ]},
            set: { newValue in }
        )
    ))
}
