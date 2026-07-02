//
//  ToolbarButton.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/28/26.
//

import SwiftUI
import MarkupEditor

struct ToolbarButton: View {
    let systemName: String
    let action: ()->Void
    @Environment(\.colorScheme) var colorScheme
    let toolbarConfig: ToolbarConfig = ToolbarConfig.fromDefaults()

    var body: some View {
        let dimension = CGFloat(toolbarConfig.buttonHeight())
        let accent = Color(toolbarConfig.accentColor(colorScheme))
        Button(action: action) {
            Image(systemName: systemName)
                .imageScale(.large)
        }
        .buttonStyle(.plain)
        .frame(width: dimension, height: dimension)
        .background(Color(NSColor.windowBackgroundColor))
        .cornerRadius(3)
        .foregroundColor(accent)
        .overlay(
            RoundedRectangle(cornerRadius: 3, style: .continuous)
                .stroke(accent)
        )
        .contentShape(RoundedRectangle(cornerRadius: 3))
    }

}
