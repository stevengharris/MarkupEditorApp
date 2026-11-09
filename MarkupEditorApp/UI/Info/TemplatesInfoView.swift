//
//  TemplatesInfoView.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

internal import UniformTypeIdentifiers

/// Lists the templates in the templates folder, read from their manifests. A template is added from a
/// Markdown file or a folder with the + button in the header, and deleted from its row.
struct TemplatesInfoView: View {

    /// A file or folder the user picked, waiting for a name and description.
    private struct PendingTemplate: Identifiable {
        let id = UUID()
        let url: URL
        var name: String
        var description: String
    }

    @Environment(EditLog.self) private var editLog
    private let library = UserLibrary.templates
    @State private var items: [UserLibraryItem] = []
    @State private var pending: PendingTemplate?
    @State private var selection: UserLibraryItem.ID?
    @State private var editingID: UserLibraryItem.ID?
    @State private var draftName = ""
    @State private var draftDescription = ""
    @FocusState private var focus: Field?
    @FocusState private var listFocused: Bool

    private enum Field { case name, description }
    @State private var deleteRequest: UserLibraryItem?
    @State private var showDelete = false
    @State private var failure: String?
    @State private var showFailure = false

    var body: some View {
        List {
            header
            if items.isEmpty {
                Text("None")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(items) { item in
                    row(item)
                        .contentShape(Rectangle())
                        .onTapGesture { tapped(item) }
                        .listRowBackground(item.id == selection ? Color(nsColor: .unemphasizedSelectedContentBackgroundColor) : Color.clear)
                        .contextMenu {
                            Button("Delete…") { requestDelete(item) }
                        }
                        .accessibilityAddTraits(item.id == selection ? .isSelected : [])
                        .accessibilityAction(named: "Delete") { requestDelete(item) }
                }
            }
        }
        .listStyle(.plain)
        // The selection is drawn here, not by the list, because the list draws it in the accent color
        // while it has keyboard focus and in gray otherwise.
        .focusable()
        .focusEffectDisabled()
        .focused($listFocused)
        .onChange(of: selection) { _, _ in
            if editingID != nil { commitEditing() }
        }
        .onKeyPress(.return) {
            guard editingID == nil, let selected else { return .ignored }
            beginEditing(selected)
            return .handled
        }
        .onDeleteCommand { _ = deleteSelectedFromKeyboard() }
        .onKeyPress(.upArrow) { moveSelection(by: -1) }
        .onKeyPress(.downArrow) { moveSelection(by: 1) }
        .padding(.horizontal, 8)
        .onAppear(perform: reload)
        .sheet(item: $pending, onDismiss: reload) { pendingTemplate in
            AddTemplateView(pending: pendingTemplate.url.lastPathComponent, name: pendingTemplate.name, description: pendingTemplate.description) { name, description in
                add(pendingTemplate.url, name: name, description: description)
                pending = nil
            } onCancel: {
                pendingTemplate.url.stopAccessingSecurityScopedResource()
                pending = nil
            }
        }
        .confirmationDialog(
            "Delete \"\(deleteRequest?.manifest.name ?? "")\"?",
            isPresented: $showDelete,
            titleVisibility: .visible,
            presenting: deleteRequest
        ) { item in
            Button("Delete", role: .destructive) { delete(item) }
            Button("Cancel", role: .cancel) {}
        } message: { _ in
            Text("This removes the template and its files. It cannot be undone.")
        }
        .alert("Could Not Change Templates", isPresented: $showFailure) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }

    private var header: some View {
        HStack {
            Text("Templates")
                .font(.title3)
            Spacer()
            Button {
                if let selected { requestDelete(selected) }
            } label: {
                Image(systemName: "minus")
            }
            .buttonStyle(SquareIconButtonStyle())
            .disabled(selected == nil)
            .help("Delete the selected template")
            .accessibilityLabel("Delete the selected template")
            Button(action: chooseSource) {
                Image(systemName: "plus")
            }
            .buttonStyle(SquareIconButtonStyle())
            .help("Add a template from a Markdown file or a folder")
            .accessibilityLabel("Add a template from a Markdown file or a folder")
        }
    }

    private var selected: UserLibraryItem? {
        items.first { $0.id == selection }
    }

    private func requestDelete(_ item: UserLibraryItem) {
        deleteRequest = item
        showDelete = true
    }

    @ViewBuilder private func row(_ item: UserLibraryItem) -> some View {
        if editingID == item.id {
            editingRow
        } else {
            VStack(alignment: .leading, spacing: 2) {
                HStack {
                    Text(item.manifest.name)
                    Spacer()
                    if item.id == selection {
                        Button("Edit") { edit(item) }
                            .controlSize(.small)
                            .help("Open \(item.manifest.name) for editing")
                    }
                }
                if !item.manifest.description.isEmpty {
                    Text(item.manifest.description)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private var editingRow: some View {
        VStack(alignment: .leading, spacing: 4) {
            TextField("Name", text: $draftName)
                .focused($focus, equals: .name)
                .onSubmit(commitEditing)
            TextField("Description", text: $draftDescription, axis: .vertical)
                .font(.caption)
                .lineLimit(1...4)
                .focused($focus, equals: .description)
                .onSubmit(commitEditing)
        }
        .textFieldStyle(.roundedBorder)
        .onKeyPress(.escape) {
            cancelEditing()
            return .handled
        }
        .onChange(of: focus) { _, new in
            if new == nil { commitEditing() }
        }
    }

    /// A click on an unselected row selects it; a click on the text of the selected row edits it.
    private func tapped(_ item: UserLibraryItem) {
        if selection == item.id {
            beginEditing(item)
        } else {
            selection = item.id
            listFocused = true
        }
    }

    private func deleteSelectedFromKeyboard() -> KeyPress.Result {
        guard editingID == nil, let selected else { return .ignored }
        requestDelete(selected)
        return .handled
    }

    private func moveSelection(by offset: Int) -> KeyPress.Result {
        guard editingID == nil, !items.isEmpty else { return .ignored }
        let current = items.firstIndex { $0.id == selection }
        let next = current.map { min(max($0 + offset, 0), items.count - 1) } ?? (offset > 0 ? 0 : items.count - 1)
        selection = items[next].id
        return .handled
    }

    private func beginEditing(_ item: UserLibraryItem) {
        draftName = item.manifest.name
        draftDescription = item.manifest.description
        editingID = item.id
        focus = .name
    }

    private func cancelEditing() {
        guard editingID != nil else { return }
        editingID = nil
        focus = nil
        listFocused = true
    }

    /// Saves the draft. An empty name leaves the template as it was.
    private func commitEditing() {
        guard let id = editingID, let item = items.first(where: { $0.id == id }) else { return }
        editingID = nil
        focus = nil
        listFocused = true
        guard !draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              draftName != item.manifest.name || draftDescription != item.manifest.description else { return }
        do {
            try library.update(item, name: draftName, description: draftDescription)
            editLog.info("Updated the template \(draftName)")
        } catch {
            editLog.error("Could not update \(item.manifest.name): \(error.localizedDescription)")
            fail(error.localizedDescription)
        }
        reload()
    }

    /// Opens the template's document in the editor through the same path as Open Recent, so unsaved
    /// changes are dealt with first. Saving then writes to the templates folder.
    private func edit(_ item: UserLibraryItem) {
        do {
            NotificationCenter.default.post(name: .openDocumentURL, object: try item.documentURL())
        } catch {
            editLog.error("Could not edit \(item.manifest.name): \(error.localizedDescription)")
            fail(error.localizedDescription)
        }
    }

    private func reload() {
        items = library.items()
    }

    /// Asks for a Markdown file or a folder with an open panel, not a SwiftUI file importer, because the
    /// document view that contains this one already presents file importers.
    private func chooseSource() {
        let panel = NSOpenPanel()
        panel.allowedContentTypes = [.folder] + (UTType(filenameExtension: "md").map { [$0] } ?? [])
        panel.allowsMultipleSelection = false
        panel.canChooseFiles = true
        panel.canChooseDirectories = true
        panel.message = "Choose a Markdown file, or a folder with a Markdown file and the files it refers to"
        Task {
            guard await panel.begin() == .OK, let url = panel.url else { return }
            // Held open until the user confirms or cancels, because the copy happens then.
            guard url.startAccessingSecurityScopedResource() else {
                fail("MarkupEditor was not given access to that file.")
                return
            }
            var name = url.deletingPathExtension().lastPathComponent
            var description = ""
            if let manifest = try? JSONDecoder().decode(LibraryManifest.self, from: Data(contentsOf: url.appendingPathComponent(UserLibraryItem.manifestName))) {
                name = manifest.name
                description = manifest.description
            }
            pending = PendingTemplate(url: url, name: name, description: description)
        }
    }

    private func add(_ url: URL, name: String, description: String) {
        defer { url.stopAccessingSecurityScopedResource() }
        do {
            let item = try library.add(from: url, name: name, description: description)
            editLog.info("Added the template \(item.manifest.name)")
        } catch {
            editLog.error("Could not add a template from \(url.lastPathComponent): \(error.localizedDescription)")
            fail(error.localizedDescription)
        }
        reload()
    }

    private func delete(_ item: UserLibraryItem) {
        do {
            try library.delete(item)
            if selection == item.id { selection = nil }
            editLog.info("Deleted the template \(item.manifest.name)")
        } catch {
            editLog.error("Could not delete \(item.manifest.name): \(error.localizedDescription)")
            fail(error.localizedDescription)
        }
        reload()
    }

    private func fail(_ message: String) {
        failure = message
        showFailure = true
    }
}
