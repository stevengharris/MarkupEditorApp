//
//  ImageInsertView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/6/26.
//

import SwiftUI
import MarkupEditor

struct ImageInsertView: View {
    
    enum FocusField {
        case src
        case alt
    }
    
    @Binding private var presented: Bool
    @State private var src: String = MarkupEditor.selectionState.src ?? ""
    @State private var alt: String = MarkupEditor.selectionState.alt ?? ""
    @FocusState private var focus: FocusField?
    private var originalSrc: String? = MarkupEditor.selectionState.src
    private var originalAlt: String? = MarkupEditor.selectionState.alt
    private var argSrc: String? { src.isEmpty ? nil : src.trimmingCharacters(in: .whitespacesAndNewlines) }
    
    var body: some View {
        //let _ = Self._printChanges()
        VStack {
            Spacer()
            Text((originalSrc?.isEmpty ?? true) ? "Add image" : "Edit image")
                .font(.title2)
            TextField("Image source", text: $src)
                .focused($focus, equals: .src)
            TextField("Description", text: $alt)
                .focused($focus, equals: .alt)
            Spacer()
            HStack {
                styledButton("Cancel", isDefault: !isSavable(), action: cancel)
                    .keyboardShortcut(isSavable() ? .cancelAction : .defaultAction)
                styledButton("Save", isDefault: isSavable(), action: save)
                    .keyboardShortcut(!isSavable() ? .cancelAction : .defaultAction)
                    .disabled(!isSavable())
            }
            Spacer()
        }
        .padding(.horizontal, 8)
        .onAppear {
            focus = .src
        }
        .frame(width: 300)
    }
    
    public init(presented: Binding<Bool>) {
        _presented = presented
    }
    
    // Ternary-fed .buttonStyle doesn't compile: .bordered and .borderedProminent
    // are different concrete ButtonStyle types, and a ternary can't unify them
    // into the single generic parameter .buttonStyle(_:) expects. Branching
    // with if/else here resolves one concrete type per call site instead.
    @ViewBuilder
    private func styledButton(_ title: String, isDefault: Bool, action: @escaping () -> Void) -> some View {
        if isDefault {
            Button(title, action: action).buttonStyle(.borderedProminent)
        } else {
            Button(title, action: action).buttonStyle(.bordered)
        }
    }

    private func save() {
        MarkupEditor.selectedWebView?.insertImage(src: argSrc, alt: alt)
        dismiss()
    }
    
    private func cancel() {
        dismiss()
    }
    
    private func dismiss() {
        presented = false
    }
    
    private func isSavable() -> Bool {
        argSrc != nil
    }

}
