//
//  TableEditView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/31/26.
//

import SwiftUI
import MarkupEditor

/// Shown as a popover when the selection is already in a table, grouping the Add/Delete/Border
/// commands under native pull-down Menus -- matching TableInsertView's popover positioning and
/// disclosure-arrow presentation instead of AppDelegate's earlier NSMenu.popUp, which had
/// inconsistent positioning relative to the selection.
struct TableEditView: View {

    @Binding private var presented: Bool
    private let showHeader: Bool
    private let showBorder: Bool

    var body: some View {
        HStack(spacing: 16) {
            Menu("Add") {
                Button("Row Above") { perform { await MarkupEditor.selectedWebView?.addRow(.before) } }
                Button("Row Below") { perform { await MarkupEditor.selectedWebView?.addRow(.after) } }
                Button("Column Before") { perform { await MarkupEditor.selectedWebView?.addCol(.before) } }
                Button("Column After") { perform { await MarkupEditor.selectedWebView?.addCol(.after) } }
                if showHeader {
                    Divider()
                    Button("Header") { perform { await MarkupEditor.selectedWebView?.addHeader() } }
                }
            }
            Menu("Delete") {
                Button("Row") { perform { await MarkupEditor.selectedWebView?.deleteRow() } }
                Button("Column") { perform { await MarkupEditor.selectedWebView?.deleteCol() } }
                Button("Table") { perform { await MarkupEditor.selectedWebView?.deleteTable() } }
            }
            if showBorder {
                Menu("Border") {
                    Button("All") { perform { await MarkupEditor.selectedWebView?.borderTable(.cell) } }
                    Button("Outer") { perform { await MarkupEditor.selectedWebView?.borderTable(.outer) } }
                    Button("Header") { perform { await MarkupEditor.selectedWebView?.borderTable(.header) } }
                    Button("None") { perform { await MarkupEditor.selectedWebView?.borderTable(.none) } }
                }
            }
        }
        .padding(10)
    }

    public init(presented: Binding<Bool>) {
        _presented = presented
        let menus = ToolbarConfig.fromDefaults().menus
        showHeader = menus["tableHeader"] == true
        showBorder = menus["tableBorder"] == true
    }

    private func perform(_ action: @escaping () async -> Void) {
        Task {
            await action()
            dismiss()
        }
    }

    private func dismiss() {
        presented = false
    }

}
