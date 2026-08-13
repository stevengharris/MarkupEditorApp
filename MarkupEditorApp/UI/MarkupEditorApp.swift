//
//  MarkupEditorApp.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor
import MarkupEditorAppLib

@main
struct MarkupEditorApp: App {
    
    static var versionString: String {
        version + "(\(build))"
    }
    
    static var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    }

    static var build: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"
    }
    
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
    
    private static let firstLaunchPluginSetupKey = "hasCompletedFirstLaunchPluginSetup"

    init() {
        MarkupEditor.allowLocalImages = true
        // Set to true to allow the MarkupWKWebView to be inspectable from the Safari Development
        // menu in iOS/macCatalyst 16.4 or higher.
        MarkupEditor.isInspectable = true
        // Pre-installed plugins (DocX, Mermaid) are seeded from the app bundle once, at true
        // first launch -- not every launch, which would re-copy over anything the user replaced
        // them with via Settings.
        if !UserDefaults.standard.bool(forKey: Self.firstLaunchPluginSetupKey) {
            AppConfig.update { config in
                config.exporters = ExporterManager.setupOnLaunch(exporters: config.exporters, codeViews: config.codeViews, resourceURL: Bundle.main.resourceURL, cacheDir: AppDelegate.webViewCacheDir)
            }
            AppConfig.update { config in
                config.codeViews = CodeViewManager.setupOnLaunch(exporters: config.exporters, codeViews: config.codeViews, resourceURL: Bundle.main.resourceURL, cacheDir: AppDelegate.webViewCacheDir)
            }
            UserDefaults.standard.set(true, forKey: Self.firstLaunchPluginSetupKey)
        }
    }
}
