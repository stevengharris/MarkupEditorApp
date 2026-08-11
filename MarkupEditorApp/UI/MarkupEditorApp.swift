//
//  MarkupEditorApp.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor

@main
struct MarkupEditorApp: App {
    
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var editLog = EditLog()
    
    var body: some Scene {
        Window("MarkupEditor", id: "main") {
            MarkupDocumentView()
                .environment(editLog)
        }
        Window("Gallery", id: "plugin-gallery") {
            PluginDiscoveryView()
        }
        .defaultSize(width: 650, height: 550)
        .windowResizability(.automatic)
        // Without this, macOS's system window-state restoration persists Gallery
        // across quit/relaunch -- and when it does, it suppresses Main's normal
        // "always create at launch" behavior instead of restoring both, so only
        // Gallery reopens. Disabling restoration keeps launches deterministic:
        // Main always opens; Gallery only when explicitly requested.
        .restorationBehavior(.disabled)
        Settings {
            SettingsView()
        }
        .defaultSize(width: 500, height: 400)
        .windowResizability(.automatic)
    }
    
    init() {
        MarkupEditor.allowLocalImages = true
        // Set to true to allow the MarkupWKWebView to be inspectable from the Safari Development
        // menu in iOS/macCatalyst 16.4 or higher.
        MarkupEditor.isInspectable = true
        ExporterManager.shared.setupOnLaunch()
        CodeViewManager.shared.setupOnLaunch()
    }
}
