//
//  SourceToolbarView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/27/26.
//

import SwiftUI
import MarkupEditor

struct SourceToolbarView: View {
    
    @Binding var document: MarkupDocument
    @Environment(\.colorScheme) var colorScheme
    let toolbarConfig: ToolbarConfig = ToolbarConfig.fromDefaults()

    var body: some View {
        HStack {
            Text("\(document.documentType) Source")
                .frame(maxWidth: .infinity)
            //Spacer()
            //ToolbarButton(systemName: "arrow.clockwise", action: onRefresh)
            //    .help("Refresh")
            //    .disabled(!document.hasChanges || MarkupEditor.selectedWebView == nil)
            //    .padding(.trailing, 8)
        }
        .frame(height: CGFloat(toolbarConfig.toolbarHeight() - 1))
        .background(
            Color(toolbarConfig.toolbarBgColor(colorScheme))
        )
    }
    
}
