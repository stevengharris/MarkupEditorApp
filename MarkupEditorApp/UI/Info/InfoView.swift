//
//  InfoView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/27/26.
//

import SwiftUI
import MarkupEditor
import SplitView
import MarkupEditorAppLib

struct InfoView: View {

    /// Shared with the toolbar, which selects Log when there is something unread.
    @AppStorage(InfoType.storageKey) private var infoType: InfoType = .plugins
    @ObservedObject var infoHide: SideHolder
    
    let height = ToolbarConfig.fromDefaults().toolbarHeight() - 1
    
    var body: some View {
        VStack(spacing: 0) {
            Picker("", selection: $infoType) {
                ForEach(InfoType.allCases) { info in
                    Text(info.rawValue)
                        .lineLimit(1)
                        .truncationMode(.tail)
                        .tag(info)
                }
            }
            .frame(minWidth: 0, maxHeight: CGFloat(height))
            .offset(x: -4, y: 0)    // Perfectly centered as SplitView drags
            .pickerStyle(.segmented)
            
            Divider()
            
            switch infoType {
            case .log:
                LogInfoView(isVisible: infoHide.side == nil)
            case .plugins:
                PluginsInfoView()
            case .templates:
                TemplatesInfoView()
            }
            
            Spacer()
        }
        .clipped()  // Just clip all to avoid layout weirdness w/ very narrow SplitView
    }
}

#Preview {
    InfoView(infoHide: SideHolder())
        .environment(EditLog())
}
