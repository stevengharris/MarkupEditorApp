//
//  TableEditView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/31/26.
//

import SwiftUI
import MarkupEditor

/// Shown as a popover when the selection is already in a table, grouping the Add/Delete/Align
/// commands under native pull-down Menus -- matching TableInsertView's popover positioning and
/// disclosure-arrow presentation instead of AppDelegate's earlier NSMenu.popUp, which had
/// inconsistent positioning relative to the selection.
struct TableEditView: View {

    @Binding private var presented: Bool

    var body: some View {
        HStack(spacing: 16) {
            Menu("Add") {
                Button("Row Above") { perform { await MarkupEditor.selectedWebView?.addRow(.before) } }
                Button("Row Below") { perform { await MarkupEditor.selectedWebView?.addRow(.after) } }
                Button("Column Before") { perform { await MarkupEditor.selectedWebView?.addCol(.before) } }
                Button("Column After") { perform { await MarkupEditor.selectedWebView?.addCol(.after) } }
            }
            Menu("Delete") {
                Button("Row") { perform { await MarkupEditor.selectedWebView?.deleteRow() } }
                Button("Column") { perform { await MarkupEditor.selectedWebView?.deleteCol() } }
                Button("Table") { perform { await MarkupEditor.selectedWebView?.deleteTable() } }
            }
            Menu("Align") {
                Button("Left") { perform { await MarkupEditor.selectedWebView?.justifyColumn(.left) } }
                Button("Center") { perform { await MarkupEditor.selectedWebView?.justifyColumn(.center) } }
                Button("Right") { perform { await MarkupEditor.selectedWebView?.justifyColumn(.right) } }
            }
        }
        .padding(10)
    }

    public init(presented: Binding<Bool>) {
        _presented = presented
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
