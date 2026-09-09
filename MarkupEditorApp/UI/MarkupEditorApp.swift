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
            kSecMatchLimit as String: kSecMatchLimitOne,
            kSecUseDataProtectionKeychain as String: true
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
            kSecValueData as String: data,
            kSecUseDataProtectionKeychain as String: true
        ]
        return SecItemAdd(query as CFDictionary, nil) == errSecSuccess
    }
}
#endif
