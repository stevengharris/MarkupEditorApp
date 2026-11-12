//
//  LogInfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI
import AppKit
import MarkupEditorAppLib

/// The log: a filtered list of entries with row selection, Copy and Clear. A group row expands to its details.
struct LogInfoView: View {

    /// Whether the sidebar is showing. This view exists only while the Log tab is selected, so showing the sidebar
    /// makes the log visible.
    let isVisible: Bool

    @Environment(EditLog.self) private var editLog
    @State private var filter: LogFilter = .all
    /// Whether the newest entry is at the top. Kept between launches.
    @AppStorage("logNewestFirst") private var newestFirst = false
    @State private var selection = Set<LogEntry.ID>()
    @State private var expanded = Set<LogEntry.ID>()
    /// True for a moment after something is copied, so the Copy button can say so.
    @State private var showsCopied = false
    @State private var copiedReset: Task<Void, Never>?
    /// False once the user scrolls away from the newest entry, so new entries do not pull the view back.
    @State private var atLatestEnd = true

    /// The inset the Plugins tab uses. Every entry is pulled left by it, so group and plain entries start at the
    /// same place and the arrow sits as close to its text as in the Plugins tab.
    private static let chevronInset: CGFloat = 8
    /// The list reserves a column for the arrows only while some row has one, which moves every row right by this
    /// much. Plain entries add it back when there is no group, so their text does not jump as groups come and go.
    private static let arrowColumn: CGFloat = 17.5
    /// The label height of the header buttons. Text beside the icon is taller than the icon alone, so both
    /// states share one height and the buttons do not grow while "Copied" shows.
    private static let buttonContentHeight: CGFloat = 16

    private var visible: [LogEntry] { filter.visible(in: editLog.entries) }

    /// The visible entries in the order they are shown.
    private var displayed: [LogEntry] { newestFirst ? visible.reversed() : visible }

    private var showsArrowColumn: Bool { visible.contains { !$0.details.isEmpty } }

    /// The selected rows that are visible, or every visible row when none of the selected rows shows, in the order shown.
    private var entriesToCopy: [LogEntry] {
        let selected = filter.selected(selection, in: editLog.entries)
        return inDisplayOrder(selected.isEmpty ? visible : selected)
    }

    /// Entries in chronological order, reordered to match the list.
    private func inDisplayOrder(_ entries: [LogEntry]) -> [LogEntry] {
        newestFirst ? entries.reversed() : entries
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            if visible.isEmpty {
                Spacer()
                Text(editLog.entries.isEmpty ? "Log is empty." : "No entries match the filter.")
                    .foregroundStyle(.secondary)
                Spacer()
            } else {
                list
            }
        }
        .onChange(of: isVisible, initial: true) { markReadIfVisible() }
        .onChange(of: editLog.unreadLevel) { markReadIfVisible() }
    }

    /// What the user can see is read: entries recorded while the log is showing never light the indicator.
    private func markReadIfVisible() {
        if isVisible { editLog.markRead() }
    }

    private var header: some View {
        HStack {
            Picker("Show", selection: $filter) {
                ForEach(LogFilter.allCases) { Text($0.rawValue).tag($0) }
            }
            .labelsHidden()
            Spacer()
            Button { newestFirst.toggle() } label: {
                Label(newestFirst ? "Newest first" : "Oldest first", systemImage: newestFirst ? "arrow.up" : "arrow.down")
                    .labelStyle(.iconOnly)
                    .frame(height: Self.buttonContentHeight)
            }
            .help(newestFirst ? "Newest first. Click to show oldest first." : "Oldest first. Click to show newest first.")
            Button { copy(entriesToCopy) } label: {
                Group {
                    if showsCopied {
                        Label("Copied", systemImage: "checkmark")
                            .labelStyle(.titleAndIcon)
                    } else {
                        Label("Copy", systemImage: "doc.on.doc")
                            .labelStyle(.iconOnly)
                    }
                }
                .frame(height: Self.buttonContentHeight)
            }
            .help("Copy the selected rows, or every visible row")
            .disabled(visible.isEmpty)
            Button {
                editLog.clear()
                selection = []
                expanded = []
            } label: {
                Label("Clear", systemImage: "trash")
                    .labelStyle(.iconOnly)
                    .frame(height: Self.buttonContentHeight)
            }
            .help("Clear the log")
            .disabled(editLog.entries.isEmpty)
        }
        .padding(.horizontal)
        .padding(.vertical, 6)
    }

    /// Matches the Plugins tab: a plain list, inset the same amount, with the system disclosure arrow for a group.
    private var list: some View {
        ScrollViewReader { proxy in
            entryList
                .onScrollPhaseChange { _, _, context in
                    atLatestEnd = isAtLatestEnd(context.geometry)
                }
                .onChange(of: changeToken) { if atLatestEnd { scrollToLatest(proxy) } }
                .onChange(of: newestFirst) { scrollToLatest(proxy) }
                .onChange(of: filter) { scrollToLatest(proxy) }
                .onAppear { scrollToLatest(proxy) }
        }
    }

    /// Whether the view is scrolled to the end where the newest entry is, give or take a few points.
    private func isAtLatestEnd(_ geometry: ScrollGeometry) -> Bool {
        let slack: CGFloat = 20
        if newestFirst { return geometry.contentOffset.y + geometry.contentInsets.top <= slack }
        return geometry.visibleRect.maxY >= geometry.contentSize.height + geometry.contentInsets.bottom - slack
    }

    /// Changes whenever an entry is added, folded into, or gains details.
    private var changeToken: [Int] {
        [editLog.entries.count, editLog.entries.last?.count ?? 0, editLog.entries.last?.detailCount ?? 0]
    }

    /// Shows where the newest entry is: the bottom when oldest is first, the top when newest is first.
    private func scrollToLatest(_ proxy: ScrollViewProxy) {
        guard let target = newestFirst ? displayed.first : displayed.last else { return }
        atLatestEnd = true
        Task { @MainActor in
            proxy.scrollTo(target.id, anchor: newestFirst ? .top : .bottom)
        }
    }

    private var entryList: some View {
        List(selection: $selection) {
            ForEach(displayed) { entry in
                Group {
                    if entry.details.isEmpty {
                        LogEntryRow(entry: entry)
                            .padding(.leading, (showsArrowColumn ? 0 : Self.arrowColumn) - Self.chevronInset)
                    } else {
                        DisclosureGroup(isExpanded: expandedBinding(entry.id)) {
                            ForEach(entry.details.indices, id: \.self) { index in
                                LogDetailRow(detail: entry.details[index])
                            }
                        } label: {
                            LogEntryRow(entry: entry)
                                .padding(.leading, -Self.chevronInset)
                        }
                    }
                }
                .listRowBackground(selection.contains(entry.id) ? Color(nsColor: .unemphasizedSelectedContentBackgroundColor) : Color.clear)
                .contextMenu {
                    Button("Copy") { copy(entriesForMenu(entry)) }
                    Button("Copy Message") { copyText(entry.message) }
                }
            }
        }
        .listStyle(.plain)
        .padding(.horizontal, Self.chevronInset)
        .onCopyCommand {
            confirmCopy()
            return [NSItemProvider(object: plainText(entriesToCopy) as NSString)]
        }
    }

    private func expandedBinding(_ id: LogEntry.ID) -> Binding<Bool> {
        Binding(
            get: { expanded.contains(id) },
            set: { if $0 { expanded.insert(id) } else { expanded.remove(id) } })
    }

    /// A right-click on a selected row acts on the whole selection, as in Finder.
    private func entriesForMenu(_ entry: LogEntry) -> [LogEntry] {
        selection.contains(entry.id) ? inDisplayOrder(filter.selected(selection, in: editLog.entries)) : [entry]
    }

    private func plainText(_ entries: [LogEntry]) -> String {
        let system = ProcessInfo.processInfo.operatingSystemVersion
        let header = "MarkupEditor \(BuildVariant.versionString)\nmacOS \(system.majorVersion).\(system.minorVersion).\(system.patchVersion)"
        return editLog.plainText(entries: entries, header: header)
    }

    private func copy(_ entries: [LogEntry]) {
        copyText(plainText(entries))
    }

    private func copyText(_ text: String) {
        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(text, forType: .string)
        confirmCopy()
    }

    private func confirmCopy() {
        showsCopied = true
        copiedReset?.cancel()
        copiedReset = Task {
            try? await Task.sleep(for: .seconds(1.5))
            if !Task.isCancelled { showsCopied = false }
        }
    }
}

#Preview {
    LogInfoView(isVisible: true)
        .environment(EditLog())
}
