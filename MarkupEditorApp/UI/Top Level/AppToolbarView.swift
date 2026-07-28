//
//  AppToolbarView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/23/26.
//

import SwiftUI
import MarkupEditor
import SplitView

struct AppToolbarView: ToolbarContent {

    typealias ToggledState = AppConfig.ToggledState

    @Environment(\.openSettings) private var openSettings
    
    @Binding var url: URL?
    @Binding var toolbarConfigJSON: String
    @Binding var markupConfiguration: MarkupWKWebViewConfiguration
    @Binding var infoHide: SideHolder
    
    @ScaledMetric(relativeTo: .title3) var iconSize: CGFloat = 22

    var body: some ToolbarContent {
        // Sidebar toggle: insert ToolbarItem(placement: .navigation) here when adding a sidebar.
        ToolbarItem(placement: .navigation) {
            HStack(alignment: .center, spacing: 4) {
                if let url {
                    Image(nsImage: NSWorkspace.shared.icon(forFile: url.path(percentEncoded: false)))
                        .resizable()
                        .scaledToFit()
                        .frame(width: iconSize, height: iconSize)
                } else if let nsImage = AppDelegate.docIcon {
                    Image(nsImage: nsImage)
                        .resizable()
                        .scaledToFit()
                        .frame(width: iconSize, height: iconSize)
                }
                Text(url?.lastPathComponent ?? "MarkupEditor")
                    .font(.title3)
            }
            .allowsHitTesting(false)
        }
        .sharedBackgroundVisibility(.hidden)
        ToolbarSpacer(.flexible)
        ToolbarItemGroup {
            if let url {
                ShareLink(item: url)
            }
            if AppConfig.shared.isToggled() {
                // The button will only appear if the behavior is set to toggled. The behavior
                // can change from the ToolbarSettingsView; AppConfig's Observable tracking updates this view automatically.
                Button(action: {
                    let newVisible = AppConfig.shared.isHidden()
                    AppConfig.update { config in
                        config.toggledState = newVisible ? ToggledState.visible.rawValue : ToggledState.hidden.rawValue
                    }
                    // Reset toolbarConfig inside of markupConfiguration so it displays properly initially
                    var toolbarConfig = markupConfiguration.toolbarConfig
                    toolbarConfig?.visibility["toolbar"] = newVisible
                    markupConfiguration.toolbarConfig = toolbarConfig
                    // Then save it, which triggers the .onChange(of: toolbarConfigJSON) in MarkupDocumentView
                    if let toolbarConfig, let json = toolbarConfig.asJSON(), json != toolbarConfigJSON {
                        toolbarConfigJSON = json
                    } else {
                        assertionFailure("ToolbarConfig encoding failed unexpectedly")
                    }
                }) {
                    Image(systemName: "inset.filled.topthird.rectangle")
                }
            }
            Button(action: {
                // See https://github.com/stevengharris/SplitView/issues/48 for better animation
                withAnimation {
                    infoHide.toggle()
                }
            }) {
                Image(systemName: "sidebar.right")
            }
            // The settings button will go away, it's just a convenience during development
            Button(action: {
                openSettings()
            }) {
                Image(systemName: "gearshape")
            }
        }
    }
}
