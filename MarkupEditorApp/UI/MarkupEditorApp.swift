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
import Security
#endif

@main
struct MarkupEditorApp: App {
    
    static let firstLaunchPluginSetupKey = "hasCompletedFirstLaunchPluginSetup"
    static let hasSeenTourKey = "hasSeenTour"
    
    static var hasSeenTour: Bool { UserDefaults.standard.bool(forKey: hasSeenTourKey) }
    
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
    @AppStorage(Self.hasSeenTourKey) private var hasSeenTour = false
    
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
            TourView(editLog: $editLog)
        }
        .defaultLaunchBehavior(!hasSeenTour ? .presented : .automatic)
    }
    
    init() {
        #if EVAL_VERSION
        // Checked first, before anything else in init(): an expired launch
        // terminates immediately, and should not have run plugin setup first.
        Self.performEvaluationCheck()
        #endif
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
        // Internal plugins (currently just Metadata) are re-synced every launch, unlike the
        // first-launch-only seeding above -- they have no user-facing update mechanism, so an
        // existing install must also pick up a newer bundled copy.
        AppConfig.update { config in
            config.codeViews = CodeViewManager.syncInternalPlugins(exporters: config.exporters, codeViews: config.codeViews, resourceURL: Bundle.main.resourceURL, cacheDir: AppDelegate.webViewCacheDir)
        }
    }
}

#if EVAL_VERSION
extension MarkupEditorApp {

    private static func performEvaluationCheck() {
        switch EvaluationKeychain.lookupFirstLaunchDate() {
        case .notFound:
            let now = Date()
            EvaluationKeychain.recordFirstLaunch(now)
            presentFirstLaunchNotice(firstLaunch: now)
        case .found(let firstLaunch):
            if EvaluationPolicy.isExpired(firstLaunch: firstLaunch, now: Date()) {
                presentExpirationAlertAndQuit()
            }
        case .failed:
            // Fail safe: neither block the launch nor attempt a write that
            // might collide with an item we failed to read.
            break
        }
    }

    private static func presentFirstLaunchNotice(firstLaunch: Date) {
        let expiration = EvaluationPolicy.expirationDate(from: firstLaunch)
        let formatted = DateFormatter.localizedString(from: expiration, dateStyle: .long, timeStyle: .none)
        let alert = NSAlert()
        alert.alertStyle = .informational
        alert.messageText = "Evaluation Version"
        // The body is one accessory view, not informativeText + a separate
        // accessory -- two independently-laid-out text blocks left a visible
        // gap mismatch between them. NSAlert.informativeText is a plain
        // String and can't render a link itself, so the whole paragraph
        // (with "markupeditor.app" as the one linked run) lives here instead.
        alert.accessoryView = evaluationNoticeField(formattedExpiration: formatted)
        alert.addButton(withTitle: "OK")
        alert.runModal()
    }

    /// A SwiftUI `Text` hosted as the accessory view -- its Markdown link
    /// syntax renders "markupeditor.app" as a real clickable link with no
    /// manual NSAttributedString/frame layout, which NSAlert.informativeText
    /// (a plain String) can't do on its own.
    private static func evaluationNoticeField(formattedExpiration: String) -> NSView {
        let text = Text("This is an evaluation copy of MarkupEditor, usable through \(formattedExpiration). Subscribe at [markupeditor.app](https://www.markupeditor.app/downloads/) any time to keep using it afterward.")
            .frame(width: 300, alignment: .leading)
            .fixedSize(horizontal: false, vertical: true)
        let hosting = NSHostingView(rootView: text)
        // NSAlert positions an accessoryView from its frame, not Auto
        // Layout constraints, so size it explicitly rather than relying on
        // constraints alone. 300 matches NSAlert's default message-column
        // width; fittingSize gives the wrapped height for that width.
        hosting.frame = NSRect(x: 0, y: 0, width: 300, height: hosting.fittingSize.height)
        return hosting
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
}

/// Keychain-backed storage for the eval version's first-launch date.
enum EvaluationKeychain {

    private static let service = "com.stevengharris.MarkupEditorApp.eval"
    private static let account = "firstLaunchDate"

    enum Lookup {
        case notFound
        case found(Date)
        /// Read failed, or the stored data was unreadable -- distinct from
        /// `.notFound` so a real failure isn't mistaken for first launch,
        /// and never treated as expiration either.
        case failed(OSStatus)
    }

    static func lookupFirstLaunchDate() -> Lookup {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: AnyObject?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        switch status {
        case errSecSuccess:
            guard let data = item as? Data,
                  let date = try? JSONDecoder().decode(Date.self, from: data) else {
                return .failed(status)
            }
            return .found(date)
        case errSecItemNotFound:
            return .notFound
        default:
            return .failed(status)
        }
    }

    /// Add-only: never updates an existing item. A failed write just means
    /// the next launch finds no item and retries as first launch -- fails
    /// toward "never expires," not toward "expires immediately."
    @discardableResult
    static func recordFirstLaunch(_ date: Date) -> Bool {
        guard let data = try? JSONEncoder().encode(date) else { return false }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecValueData as String: data
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }
}
#endif
