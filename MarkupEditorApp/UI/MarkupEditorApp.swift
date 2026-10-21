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
    
    static let firstLaunchDateKey = BuildVariant.firstLaunchDateKey
    static let hasSetupPluginsKey = "hasSetupPluginsKey"
    static let hasSeenWelcomeKey = "hasSeenWelcomeKey"
    /// Scene id of the document window, which is also its `NSWindow` identifier.
    static let mainWindowID = "main"
    
    static var versionString: String { BuildVariant.versionString }
    
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var editLog = EditLog()
    
    @AppStorage(Self.hasSeenWelcomeKey) private var hasSeenWelcome = false
    @AppStorage(Self.hasSetupPluginsKey) private var hasSetupPlugins = false
    
#if EVAL_VERSION
    /// The evaluation had expired when the app launched. Fixed at launch so a document is never
    /// swapped out from under the user when the expiration passes mid-session.
    private let expiredAtLaunch = EvaluationManager.isExpired()
#endif

    var body: some Scene {
        Window("MarkupEditor", id: Self.mainWindowID) {
#if EVAL_VERSION
            if expiredAtLaunch {
                ExpiredDocumentRedirect()
            } else {
                MarkupDocumentView()
                    .environment(editLog)
            }
#else
            MarkupDocumentView()
                .environment(editLog)
#endif
        }
        .defaultSize(AppConfig.shared.documentWindowSize)
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
        Window("MarkupEditor", id: "welcome") {
            WelcomeView()
        }
        .windowResizability(.contentSize)
#if EVAL_VERSION
        // An expired evaluation presents the Welcome even if it was already seen, because
        // WelcomeView is what hands off to the upgrade window.
        .defaultLaunchBehavior(!hasSeenWelcome || expiredAtLaunch ? .presented : .automatic)
#else
        .defaultLaunchBehavior(!hasSeenWelcome ? .presented : .automatic)
#endif
#if EVAL_VERSION
        Window("Upgrade to Unlimited", id: "upgrade") {
            UpgradeView()
        }
        .windowResizability(.contentSize)
        .restorationBehavior(.disabled)
        .defaultLaunchBehavior(.suppressed)
#endif
    }
    
    init() {
        _ = UpdateManager.shared
        AppControl.shared.reconcile()
        Task { await SubscriptionModel.shared.refresh() }
        _ = SubscriptionModel.reconnectRefresher
        MarkupEditor.allowLocalImages = true
        // Keep WebKit from substituting curly quotes and em dashes as text is typed. A smart quote
        // breaks syntax highlighting in code blocks and is turned back into a straight one when the
        // document is toggled back from Markdown.
        UserDefaults.standard.set(false, forKey: "WebAutomaticQuoteSubstitutionEnabled")
        UserDefaults.standard.set(false, forKey: "WebAutomaticDashSubstitutionEnabled")
        // Set to true to allow the MarkupWKWebView to be inspectable from the Safari Development
        // menu in iOS/macCatalyst 16.4 or higher.
        MarkupEditor.isInspectable = true
        // Pre-installed plugins (DocX, Mermaid) are seeded from the app bundle once, at true
        // first launch -- not every launch, which would re-copy over anything the user replaced
        // them with via Settings.
        if !hasSetupPlugins {
            AppConfig.update { config in
                config.exporters = ExporterManager.setupOnLaunch(exporters: config.exporters, codeViews: config.codeViews, resourceURL: Bundle.main.resourceURL, cacheDir: AppDelegate.webViewCacheDir)
            }
            AppConfig.update { config in
                config.codeViews = CodeViewManager.setupOnLaunch(exporters: config.exporters, codeViews: config.codeViews, resourceURL: Bundle.main.resourceURL, cacheDir: AppDelegate.webViewCacheDir)
            }
            hasSetupPlugins = true
        }
        // Built-in exporters need no file, so an existing install picks up a newly added one here.
        AppConfig.update { config in
            config.exporters = ExporterManager.ensureBuiltIns(config.exporters)
        }
        // Internal plugins (currently just Metadata) are re-synced every launch, unlike the
        // first-launch-only seeding above -- they have no user-facing update mechanism, so an
        // existing install must also pick up a newer bundled copy.
        AppConfig.update { config in
            config.codeViews = CodeViewManager.syncInternalPlugins(exporters: config.exporters, codeViews: config.codeViews, resourceURL: Bundle.main.resourceURL, cacheDir: AppDelegate.webViewCacheDir)
        }
    }
    
}

#if EVAL_VERSION
/// Stands in for the document window on an expired evaluation. A Finder open still creates
/// the main window, so this hands off to the upgrade window and closes itself before any
/// editor view exists.
private struct ExpiredDocumentRedirect: View {
    @Environment(\.openWindow) private var openWindow
    @Environment(\.dismissWindow) private var dismissWindow

    var body: some View {
        Color.clear
            .frame(width: 1, height: 1)
            .task {
                openWindow(id: "upgrade")
                dismissWindow(id: MarkupEditorApp.mainWindowID)
            }
    }
}
#endif
