//
//  TemplatesInfoView.swift
//  MarkupEditorApp
//

import SwiftUI
import MarkupEditorAppLib

internal import UniformTypeIdentifiers

/// The Templates section of the Tools tab: the templates in the templates folder, read from their manifests.
/// A template is added from a Markdown file or a folder with the + button in the header, and deleted from its row.
/// It is a disclosure group, so it is placed in the list of `ToolsInfoView`.
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
    @State private var expanded = true
    @State private var items: [UserLibraryItem] = []
    /// The built-in templates whose saved copy differs from the one the app ships, by folder name.
    @State private var modifiedBuiltIns: Set<UserLibraryItem.ID> = []
    @State private var pending: PendingTemplate?
    /// Set while a template is being copied into the templates folder, which can take a while for large images.
    @State private var isAdding = false
    @State private var selection: UserLibraryItem.ID?
    @State private var editingID: UserLibraryItem.ID?
    @State private var draftName = ""
    @State private var draftDescription = ""
    @FocusState private var focus: Field?
    @FocusState private var listFocused: Bool

    private enum Field { case name, description }
    @State private var deleteRequest: UserLibraryItem?
    @State private var showDelete = false
    @State private var failureTitle = ""
    @State private var failure: String?
    @State private var showFailure = false

    var body: some View {
        DisclosureGroup(isExpanded: $expanded) {
            if items.isEmpty {
                Text("None")
                    .foregroundStyle(.secondary)
                    .padding(.leading, -(InfoSectionLayout.disclosureIndent + InfoSectionLayout.chevronInset))
            } else {
                ForEach(items) { item in
                    row(item)
                        .contentShape(Rectangle())
                        .onTapGesture { tapped(item) }
                        .listRowBackground(item.id == selection ? Color(nsColor: .unemphasizedSelectedContentBackgroundColor) : Color.clear)
                        .contextMenu {
                            Button("Delete…") { requestDelete(item) }
                        }
                        .padding(.leading, -(InfoSectionLayout.disclosureIndent + InfoSectionLayout.chevronInset))
                }
            }
        } label: {
            header
                .padding(.leading, -InfoSectionLayout.chevronInset)
        }
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
        .onAppear(perform: reload)
        .onReceive(NotificationCenter.default.publisher(for: .templatesDidChange)) { _ in reload() }
        .sheet(item: $pending, onDismiss: reload) { pendingTemplate in
            AddTemplateView(title: "Add Template", detail: "From \(pendingTemplate.url.lastPathComponent)", confirmTitle: "Add", name: pendingTemplate.name, description: pendingTemplate.description) { name, description in
                Task { await add(pendingTemplate.url, name: name, description: description) }
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
        .alert(failureTitle, isPresented: $showFailure) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(failure ?? "")
        }
    }

    private var header: some View {
        HStack {
            Label("Templates", systemImage: "puzzlepiece.extension")
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
            if isAdding {
                ProgressView()
                    .controlSize(.small)
                    .help("Adding the template")
                    .accessibilityLabel("Adding the template")
            }
            Button(action: chooseSource) {
                Image(systemName: "plus")
            }
            .buttonStyle(SquareIconButtonStyle())
            .disabled(isAdding)
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
                    if modifiedBuiltIns.contains(item.id) {
                        Button("Restore…") { restore(item) }
                            .controlSize(.small)
                            .help("Replace \(item.manifest.name) with the version that ships with MarkupEditor")
                    }
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
            .modifier(rowAccessibility(for: item))
        }
    }

    /// Presents the row to VoiceOver as one button that selects the template, with the row's other commands as
    /// actions. The Edit and Restore buttons drawn in the row are reached through those actions instead of as
    /// separate elements inside it.
    private func rowAccessibility(for item: UserLibraryItem) -> some ViewModifier {
        TemplateRowAccessibility(
            name: item.manifest.name,
            detail: [item.manifest.description, modifiedBuiltIns.contains(item.id) ? "Differs from the version that ships with MarkupEditor" : ""]
                .filter { !$0.isEmpty }.joined(separator: ". "),
            isSelected: item.id == selection,
            isModified: modifiedBuiltIns.contains(item.id),
            select: { selection = item.id; listFocused = true },
            rename: { selection = item.id; beginEditing(item) },
            edit: { edit(item) },
            restore: { restore(item) },
            delete: { requestDelete(item) })
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
        guard let id = editingID else { return }
        editingID = nil
        focus = nil
        listFocused = true
        guard let item = items.first(where: { $0.id == id }) else { return }
        guard !draftName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              draftName != item.manifest.name || draftDescription != item.manifest.description else { return }
        do {
            try library.update(item, name: draftName, description: draftDescription)
            editLog.info("Updated the template \(draftName)", category: "Template")
        } catch {
            editLog.error("Could not update \(item.manifest.name): \(error.localizedDescription)", category: "Template")
            fail("Could Not Rename Template", error.localizedDescription)
        }
        reload()
    }

    /// Opens the template's document in the editor through the same path as Open Recent, so unsaved
    /// changes are dealt with first. Saving then writes to the templates folder.
    private func edit(_ item: UserLibraryItem) {
        do {
            NotificationCenter.default.post(name: .openDocumentURL, object: try item.documentURL())
        } catch {
            editLog.error("Could not edit \(item.manifest.name): \(error.localizedDescription)", category: "Template")
            fail("Could Not Edit Template", error.localizedDescription)
        }
    }

    private func reload() {
        items = library.items()
        modifiedBuiltIns = Set(BuiltInTemplates.all().filter { library.isModified($0) }.map(\.folder))
    }

    /// Replaces the template with the version the app ships, after warning that the current one is lost.
    private func restore(_ item: UserLibraryItem) {
        guard let builtIn = BuiltInTemplates.all().first(where: { $0.folder == item.id }) else { return }
        let alert = NSAlert()
        alert.messageText = "Replace the current version of \"\(item.manifest.name)\" with the default for this version of the MarkupEditor?"
        alert.informativeText = "To save the current version first, Cancel now. Then, select Edit, and File > Save as Template under a new name before restoring."
        alert.alertStyle = .warning
        let cancel = alert.addButton(withTitle: "Cancel")
        alert.addButton(withTitle: "OK").hasDestructiveAction = true
        // A button titled Cancel is given Escape and no default; Return makes it the default button.
        cancel.keyEquivalent = "\r"
        guard alert.runModal() == .alertSecondButtonReturn else { return }
        do {
            try library.restore(builtIn)
            editLog.info("Restored the template \(builtIn.manifest.name)", category: "Template")
        } catch {
            editLog.error("Could not restore \(item.manifest.name): \(error.localizedDescription)", category: "Template")
            fail("Could Not Restore Template", error.localizedDescription)
        }
        reload()
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
                fail("Could Not Add Template", "MarkupEditor was not given access to that file.")
                return
            }
            if (try? url.resourceValues(forKeys: [.isDirectoryKey]))?.isDirectory == true {
                do {
                    try UserLibrary.validate(folder: url)
                } catch {
                    url.stopAccessingSecurityScopedResource()
                    fail("Could Not Add Template", error.localizedDescription)
                    return
                }
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

    /// Copies the file or folder into the templates folder off the main thread, so a large folder does not freeze
    /// the window. Access to the source is held until the copy ends.
    private func add(_ url: URL, name: String, description: String) async {
        defer { url.stopAccessingSecurityScopedResource() }
        isAdding = true
        defer { isAdding = false }
        let library = library
        do {
            let item = try await Task.detached { try library.add(from: url, name: name, description: description) }.value
            editLog.info("Added the template \(item.manifest.name)", category: "Template")
        } catch {
            editLog.error("Could not add a template from \(url.lastPathComponent): \(error.localizedDescription)", category: "Template")
            fail("Could Not Add Template", error.localizedDescription)
        }
        reload()
    }

    private func delete(_ item: UserLibraryItem) {
        do {
            try library.delete(item)
            if selection == item.id { selection = nil }
            editLog.info("Deleted the template \(item.manifest.name)", category: "Template")
        } catch {
            editLog.error("Could not delete \(item.manifest.name): \(error.localizedDescription)", category: "Template")
            fail("Could Not Delete Template", error.localizedDescription)
        }
        reload()
    }

    private func fail(_ title: String, _ message: String) {
        failureTitle = title
        failure = message
        showFailure = true
    }
}

/// A template row as one VoiceOver button: the name and description are read, the default action selects it,
/// and Rename, Edit, Restore and Delete are offered as actions.
private struct TemplateRowAccessibility: ViewModifier {
    let name: String
    let detail: String
    let isSelected: Bool
    let isModified: Bool
    let select: () -> Void
    let rename: () -> Void
    let edit: () -> Void
    let restore: () -> Void
    let delete: () -> Void

    func body(content: Content) -> some View {
        content
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(name)
            .accessibilityValue(detail)
            .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
            .accessibilityAction(.default, select)
            .accessibilityActions {
                Button("Rename", action: rename)
                Button("Edit", action: edit)
                if isModified { Button("Restore", action: restore) }
                Button("Delete", action: delete)
            }
    }
}
