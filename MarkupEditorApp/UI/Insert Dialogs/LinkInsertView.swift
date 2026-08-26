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
    @State private var headers: [HeaderInfo] = []
    @State private var selectedHeaderIndex: Int? = nil
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
                .disabled(selectedHeaderIndex != nil)
            if !headers.isEmpty {
                // Picker (not Menu) so .menu style spans the given width regardless of the
                // selected item's length; Section gives the H1-H6 grouping. "None" is the only
                // way back to the URL field once a header's been picked, short of Cancel.
                HStack {
                    Text("Link to header")
                    Picker(selection: $selectedHeaderIndex) {
                        Text("None").tag(nil as Int?)
                        ForEach(headersByTag, id: \.hTag) { group in
                            Section(StyleContext.with(tag: group.hTag).name) {
                                ForEach(group.entries, id: \.offset) { entry in
                                    Text(entry.header.text).tag(Optional(entry.offset))
                                }
                            }
                        }
                    } label: {
                        EmptyView()
                    }
                    .pickerStyle(.menu)
                    .labelsHidden()
                    .frame(maxWidth: .infinity)
                }
                .onChange(of: selectedHeaderIndex) { _, newValue in
                    if let newValue {
                        href = "#" + id(for: headers[newValue])
                    } else {
                        href = ""
                    }
                }
            }
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
        .task {
            if let webView = MarkupEditor.selectedWebView {
                headers = await webView.getHeaders()
                if let originalHRef, originalHRef.hasPrefix("#") {
                    let targetId = String(originalHRef.dropFirst())
                    selectedHeaderIndex = headers.firstIndex { $0.id == targetId }
                }
            }
        }
        .frame(width: 300)
    }
    
    public init(presented: Binding<Bool>) {
        _presented = presented
    }

    /// Headers grouped by hTag, H1 through H6, each group's entries in document order.
    /// `getHeaders()` already returns them level-by-level with document order preserved
    /// within each level, so grouping here doesn't need to re-sort anything.
    private var headersByTag: [(hTag: String, entries: [(offset: Int, header: HeaderInfo)])] {
        let grouped = Dictionary(grouping: Array(headers.enumerated())) { $0.element.hTag }
        return ["H1", "H2", "H3", "H4", "H5", "H6"].compactMap { hTag in
            guard let entries = grouped[hTag], !entries.isEmpty else { return nil }
            return (hTag, entries.map { (offset: $0.offset, header: $0.element) })
        }
    }

    /// The id insertInternalLink will use for `header`. If `header` already has one, use it as-is.
    /// Otherwise, predict it: lowercase the text, cut it to 40 characters, and replace spaces with
    /// hyphens -- e.g. "Getting Started" becomes "getting-started". Doesn't handle the rare case
    /// where that prediction collides with an id already used elsewhere in the document, so the id
    /// actually assigned on Save could differ from this preview then.
    private func id(for header: HeaderInfo) -> String {
        if let id = header.id { return id }
        let truncated = header.text.lowercased().prefix(40)
        return truncated.replacingOccurrences(of: " ", with: "-")
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
        if let selectedHeaderIndex, headers.indices.contains(selectedHeaderIndex) {
            let header = headers[selectedHeaderIndex]
            MarkupEditor.selectedWebView?.insertInternalLink(hTag: header.hTag, index: header.index)
        } else {
            MarkupEditor.selectedWebView?.insertLink(argHRef)
        }
        dismiss()
    }

    private func cancel() {
        dismiss()
    }

    private func dismiss() {
        presented = false
    }

    private func isSavable() -> Bool {
        if selectedHeaderIndex != nil { return true }
        guard let argHRef else { return false }
        return argHRef.isValidURL
    }
    
    private func isRemovable() -> Bool {
        originalHRef != nil
    }

}
