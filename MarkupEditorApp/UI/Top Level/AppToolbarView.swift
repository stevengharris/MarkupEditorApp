//
//  AppToolbarView.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/23/26.
//

import SwiftUI
import MarkupEditor
import SplitView
import MarkupEditorAppLib

struct AppToolbarView: ToolbarContent {

    typealias ToggledState = AppConfig.ToggledState

    @Binding var url: URL?
    @Binding var toolbarConfigJSON: String
    @Binding var markupConfiguration: MarkupWKWebViewConfiguration
    @ObservedObject var infoHide: SideHolder
    @Environment(EditLog.self) private var editLog
    @AppStorage(InfoType.storageKey) private var infoType: InfoType = .plugins
    
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
        if AppControl.shared.isEnabled {
            ToolbarItem {
                AssistantActivityIndicator()
            }
            // Keeps the indicator in its own glass pill so it does not shift the buttons that follow.
            ToolbarSpacer(.fixed)
        }
        ToolbarItemGroup {
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
            Button(action: toggleSidebar) {
                Image(systemName: "sidebar.right")
                    .overlay(alignment: .topTrailing) { unreadIndicator }
            }
            .accessibilityLabel(sidebarLabel)
        }
    }

    /// With something unread the button leads to the log: it shows the sidebar and selects the Log tab, and an
    /// open sidebar stays open. Otherwise it shows or hides the sidebar.
    private func toggleSidebar() {
        // See https://github.com/stevengharris/SplitView/issues/48 for better animation
        withAnimation {
            if editLog.unreadLevel == nil {
                infoHide.toggle()
            } else {
                infoType = .log
                infoHide.side = nil
            }
        }
    }

    /// A yellow dot for a warning and a red one for an error. The border follows the appearance so the dot
    /// stands out on a light or a dark toolbar.
    @ViewBuilder
    private var unreadIndicator: some View {
        switch editLog.unreadLevel {
        case .warning:
            indicatorDot(.yellow)
        case .error:
            indicatorDot(.red)
        case .info, nil:
            EmptyView()
        }
    }

    private func indicatorDot(_ color: Color) -> some View {
        Circle()
            .fill(color)
            .overlay(Circle().strokeBorder(Color.primary.opacity(0.5), lineWidth: 1))
            .frame(width: 9, height: 9)
            .offset(x: 4, y: -4)
    }

    private var sidebarLabel: String {
        switch editLog.unreadLevel {
        case .warning: "Show Log, unread warnings"
        case .error: "Show Log, unread errors"
        case .info, nil: "Toggle Sidebar"
        }
    }
}
