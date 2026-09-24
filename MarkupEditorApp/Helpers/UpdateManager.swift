//
//  UpdateManager.swift
//  MarkupEditorApp
//

import Foundation
import Sparkle

/// Owns the Sparkle updater for the app's lifetime.
@Observable
final class UpdateManager: NSObject, SPUUpdaterDelegate {

    static let shared = UpdateManager()

    static let defaultFeedURL = "https://www.markupeditor.app/appcast.xml"
    static let feedURLOverrideKey = "UpdateFeedURLOverride"

    @ObservationIgnored private var controller: SPUStandardUpdaterController?

    var automaticallyChecks: Bool {
        get { access(keyPath: \.automaticallyChecks); return updater?.automaticallyChecksForUpdates ?? false }
        set { withMutation(keyPath: \.automaticallyChecks) { updater?.automaticallyChecksForUpdates = newValue } }
    }

    var automaticallyDownloads: Bool {
        get { access(keyPath: \.automaticallyDownloads); return updater?.automaticallyDownloadsUpdates ?? false }
        set { withMutation(keyPath: \.automaticallyDownloads) { updater?.automaticallyDownloadsUpdates = newValue } }
    }

    private var updater: SPUUpdater? { controller?.updater }

    private override init() {
        super.init()
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: nil)
    }

    func checkNow() {
        controller?.checkForUpdates(nil)
    }

    nonisolated func feedURLString(for updater: SPUUpdater) -> String? {
        UserDefaults.standard.string(forKey: Self.feedURLOverrideKey) ?? Self.defaultFeedURL
    }
}
