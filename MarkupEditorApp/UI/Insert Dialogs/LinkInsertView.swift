//
//  LinkInsertView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/5/26.
//

import SwiftUI
import MarkupEditor

struct LinkInsertView: View {
    
    @Binding private var presented: Bool
    @State private var href: String = MarkupEditor.selectionState.href ?? ""
    @FocusState private var focus: Bool
    private var originalHRef: String? = MarkupEditor.selectionState.href
    private var argHRef: String? { href.isEmpty ? nil : href.trimmingCharacters(in: .whitespacesAndNewlines) }
    
    var body: some View {
        //let _ = Self._printChanges()
        VStack {
            Spacer()
            Text((originalHRef?.isEmpty ?? true) ? "Add link" : "Edit link")
                .font(.title2)
            TextField("Enter or paste URL", text: $href, axis: .vertical)
                .lineLimit(2...2)
            Spacer()
            HStack {
                if isRemovable() {
                    styledButton("Remove", isDefault: false, action: remove)
                }
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
            focus = true
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

    private func remove() {
        MarkupEditor.selectedWebView?.insertLink(nil)
        dismiss()
    }
    
    private func save() {
        MarkupEditor.selectedWebView?.insertLink(argHRef)
        dismiss()
    }
    
    private func cancel() {
        dismiss()
    }
    
    private func dismiss() {
        presented = false
    }
    
    private func isSavable() -> Bool {
        guard let argHRef else { return false }
        return argHRef.isValidURL
    }
    
    private func isRemovable() -> Bool {
        originalHRef != nil
    }

}
