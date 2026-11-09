//
//  MarkupEditorApp.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 4/17/26.
//

import SwiftUI
import MarkupEditor
import MarkupEditorAppLib

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
        Settings {
            SettingsView()
        }
        .defaultSize(width: 500, height: 400)
        .windowResizability(.automatic)
        Window("MarkupEditor", id: "welcome") {
            WelcomeView()
                .environment(editLog)
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
        // breaks syntax highlighting in code blocks.
        UserDefaults.standard.set(false, forKey: "WebAutomaticQuoteSubstitutionEnabled")
        UserDefaults.standard.set(false, forKey: "WebAutomaticDashSubstitutionEnabled")
        // Set to true to allow the MarkupWKWebView to be inspectable from the Safari Development
        // menu in iOS/macCatalyst 16.4 or higher.
        MarkupEditor.isInspectable = true
        // The plugin folders and built-in exporters are set up once, at true first launch. No plugin
        // is installed by default.
        if !hasSetupPlugins {
            AppConfig.update { config in
                config.exporters = ExporterManager.setupOnLaunch(exporters: config.exporters, codeViews: config.codeViews, cacheDir: AppDelegate.webViewCacheDir)
            }
            CodeViewManager.setupOnLaunch()
            hasSetupPlugins = true
        }
        Self.seedTemplates()
        // Built-in exporters need no file, so an existing install picks up a newly added one here.
        AppConfig.update { config in
            config.exporters = ExporterManager.ensureBuiltIns(config.exporters)
        }
        // Internal plugins (currently just Metadata) are re-synced every launch, because they have
        // no user-facing update mechanism and an existing install must pick up a newer bundled copy.
        AppConfig.update { config in
            config.codeViews = CodeViewManager.syncInternalPlugins(exporters: config.exporters, codeViews: config.codeViews, resourceURL: Bundle.main.resourceURL, cacheDir: AppDelegate.webViewCacheDir)
        }
    }

    static let seededTemplatesKey = "seededTemplates"

    /// Writes the built-in templates into the templates folder. A template the user later deletes is
    /// not put back, because its name stays recorded.
    private static func seedTemplates() {
        guard let indexURL = Bundle.main.url(forResource: "templates", withExtension: "json"),
              let index = try? Data(contentsOf: indexURL),
              let builtIns = try? UserLibrary.builtIns(index: index, data: { name in
                  let url = Bundle.main.url(forResource: (name as NSString).deletingPathExtension, withExtension: (name as NSString).pathExtension)
                  return url.flatMap { try? Data(contentsOf: $0) }
              }) else { return }
        let seeded = Set(UserDefaults.standard.stringArray(forKey: seededTemplatesKey) ?? [])
        let copied = UserLibrary.templates.seed(builtIns, skipping: seeded)
        if !copied.isEmpty {
            UserDefaults.standard.set(Array(seeded.union(copied)).sorted(), forKey: seededTemplatesKey)
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
