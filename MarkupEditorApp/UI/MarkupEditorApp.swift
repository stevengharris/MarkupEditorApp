//
//  MarkupEditorApp.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor
import MarkupEditorAppLib
#if EVAL_VERSION
import AppKit
#endif

@main
struct MarkupEditorApp: App {
    
    static let firstLaunchDateKey = "firstLaunchDateKey"
    static let hasSetupPluginsKey = "hasSetupPluginsKey"
    static let hasSeenTourKey = "hasSeenTourKey"
    
    static var versionString: String { BuildVariant.versionString }
    
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @State private var editLog = EditLog()
    
    @AppStorage(Self.hasSeenTourKey) private var hasSeenTour = false
    @AppStorage(Self.hasSetupPluginsKey) private var hasSetupPlugins = false
    
#if EVAL_VERSION
    @State private var evaluationNotice: String?
#endif
    
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
        Window("MarkupEditor", id: "welcome") {
#if EVAL_VERSION
            TourView(editLog: $editLog, evaluationNotice: evaluationNotice)
#else
            TourView(editLog: $editLog)
#endif
        }
#if EVAL_VERSION
        // Forced to present even if the Tour was already seen -- a fresh
        // evaluation notice must still show at least once, and TourView folds
        // it in as a leading page rather than this window skipping it.
        .defaultLaunchBehavior((!hasSeenTour || evaluationNotice != nil) ? .presented : .automatic)
#else
        .defaultLaunchBehavior(!hasSeenTour ? .presented : .automatic)
#endif
    }
    
    init() {
#if EVAL_VERSION
        _evaluationNotice = State(initialValue: Self.evaluationCheck())
#endif
        _ = UpdateManager.shared
        Task { await SubscriptionModel.shared.refresh() }
        MarkupEditor.allowLocalImages = true
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
    
#if EVAL_VERSION
    /// Returns the first-launch notice text for TourView to fold in as a
    /// leading page (nil if there's nothing to show this launch). The
    /// expired case is handled synchronously here instead, since it must
    /// prevent window creation entirely -- only a check that runs before
    /// body is ever evaluated can do that.
    private static func evaluationCheck() -> String? {
        guard EvaluationManager.firstLaunchDate != nil else {
            let now = Date()
            EvaluationManager.recordFirstLaunch(now)
            let expiration = EvaluationManager.expirationDate()
            let formatted = DateFormatter.localizedString(from: expiration, dateStyle: .long, timeStyle: .none)
            return "This is an evaluation version of MarkupEditor, usable through \(formatted). Subscribe at markupeditor.app at any time."
        }
        if EvaluationManager.isExpired() {
            presentExpirationAlertAndQuit()
        }
        return nil
    }
    
    private static func presentExpirationAlertAndQuit() {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Evaluation Period Ended"
        alert.informativeText = "Subscribe to continue using MarkupEditor."
        alert.addButton(withTitle: "Subscribe…")
        alert.addButton(withTitle: "Quit")
        if alert.runModal() == .alertFirstButtonReturn, let url = URL(string: "https://www.markupeditor.app/downloads/") {
            NSWorkspace.shared.open(url)
        }
        NSApplication.shared.terminate(nil)
    }
#endif
    
}


