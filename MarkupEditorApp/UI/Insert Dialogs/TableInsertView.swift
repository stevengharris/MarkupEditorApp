//
//  TableInsertView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/30/26.
//

import SwiftUI
import MarkupEditor

struct TableInsertView: View {

    private static let maxRows = 6
    private static let maxCols = 8
    private static let cellSize: CGFloat = 16

    @Binding private var presented: Bool
    @State private var rows: Int = 0
    @State private var cols: Int = 0

    var body: some View {
        VStack(spacing: 6) {
            Text(isSized() ? "\(rows)x\(cols) table" : "Size the table")
                .font(.subheadline)
            grid
        }
        .padding(10)
    }

    public init(presented: Binding<Bool>) {
        _presented = presented
    }

    private var grid: some View {
        VStack(spacing: 0) {
            ForEach(0..<Self.maxRows, id: \.self) { row in
                HStack(spacing: 0) {
                    ForEach(0..<Self.maxCols, id: \.self) { col in
                        Rectangle()
                            .frame(width: Self.cellSize, height: Self.cellSize)
                            .foregroundColor(highlighted(row: row, col: col) ? Color.accentColor.opacity(0.2) : Color.clear)
                            .border(Color.accentColor)
                            .contentShape(Rectangle())
                            .onHover { hovering in
                                if hovering { select(row: row, col: col) }
                            }
                            // Clicking commits immediately, matching TableSizer (Mac Catalyst) and
                            // TableCreateSubmenu (the JS toolbar's own grid) -- there is no separate
                            // confirm step, since moving the mouse off the grid toward a Save button
                            // would itself change (or clear) the hovered size before it could be clicked.
                            .onTapGesture {
                                select(row: row, col: col)
                                Task { await insert() }
                            }
                    }
                }
            }
        }
        // Resets the pending size when the mouse leaves the grid entirely -- individual
        // cells' own onHover only fires on entry, so this is what clears a stale size
        // rather than leaving the last-hovered cell's size highlighted forever.
        .onHover { hovering in
            if !hovering { rows = 0; cols = 0 }
        }
    }

    private func highlighted(row: Int, col: Int) -> Bool {
        row < rows && col < cols
    }

    private func select(row: Int, col: Int) {
        rows = row + 1
        cols = col + 1
    }

    private func isSized() -> Bool {
        rows > 0 && cols > 0
    }

    // Awaits completion before dismissing -- table construction is heavier than a link/image
    // insert, and dismissing the popover returns focus to the webview; dismissing before the
    // JS insert (and its own selection placement into the new table's first cell) has actually
    // finished risks that focus-return racing the still-in-flight selection change.
    private func insert() async {
        await MarkupEditor.selectedWebView?.insertTable(rows: rows, cols: cols)
        dismiss()
    }

    private func dismiss() {
        presented = false
    }

}
