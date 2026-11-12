//
//  UpdateManager.swift
//  MarkupEditorApp
//

import AppKit
import Foundation
import Sparkle
import MarkupEditorAppLib

/// Owns the Sparkle updater for the app's lifetime. The feed is gated on the site by
/// member session, so checks run only while a paid member is connected, and every
/// request carries the member's cookies.
@Observable
final class UpdateManager: NSObject, SPUUpdaterDelegate {

    static let shared = UpdateManager()

#if DEBUG
    /// UserDefaults key pointing a debug build at a test feed.
    static let feedURLOverrideKey = "UpdateFeedURLOverride"
#endif

    @ObservationIgnored private var controller: SPUStandardUpdaterController?
    @ObservationIgnored private var gate = UpdateGate()

    /// True while a paid member is connected.
    var canCheck: Bool {
        get { access(keyPath: \.canCheck); return gate.canCheck }
        set {
            withMutation(keyPath: \.canCheck) {
                // A refused scheduled check still counts as a check, so run the one it replaced.
                let replay = gate.setCanCheck(newValue)
                refreshSession()
                if replay { updater?.checkForUpdatesInBackground() }
            }
        }
    }

    var automaticallyChecks: Bool {
        get { access(keyPath: \.automaticallyChecks); return updater?.automaticallyChecksForUpdates ?? false }
        set { withMutation(keyPath: \.automaticallyChecks) { updater?.automaticallyChecksForUpdates = newValue } }
    }

    var automaticallyDownloads: Bool {
        get { access(keyPath: \.automaticallyDownloads); return updater?.automaticallyDownloadsUpdates ?? false }
        set { withMutation(keyPath: \.automaticallyDownloads) { updater?.automaticallyDownloadsUpdates = newValue } }
    }

    var lastCheckDate: Date? {
        access(keyPath: \.lastCheckDate)
        return updater?.lastUpdateCheckDate
    }

    /// Nil when a debug override is set but unusable; checks are then refused.
    var feedURL: URL? {
#if DEBUG
        UpdateFeed.url(overrideValue: UserDefaults.standard.object(forKey: Self.feedURLOverrideKey))
#else
        UpdateFeed.productionURL
#endif
    }

    private var updater: SPUUpdater? { controller?.updater }

    private override init() {
        super.init()
        controller = SPUStandardUpdaterController(startingUpdater: true, updaterDelegate: self, userDriverDelegate: nil)
    }

    /// Re-reads the member cookies into the updater's request headers. Call after
    /// the member session changes.
    func refreshSession() {
        if canCheck, let feedURL {
            updater?.httpHeaders = UpdateFeed.headers(for: feedURL, cookies: .shared)
        } else {
            updater?.httpHeaders = [:]
        }
    }

    func checkNow() {
        if let refusal = gate.refusal(for: .manual, feed: feedURL) {
            let alert = NSAlert()
            alert.messageText = "Can't check for updates"
            alert.informativeText = UpdateLogFilter.refusalError(refusal).localizedDescription
            alert.runModal()
            return
        }
        refreshSession()
        controller?.checkForUpdates(nil)
    }

    /// An Evaluation build's version sorts below the matching Unlimited build, so the
    /// upgrade is an ordinary update.
    func upgradeToUnlimited() {
        checkNow()
    }

    func feedURLString(for updater: SPUUpdater) -> String? {
        feedURL?.absoluteString
    }

    /// Sparkle records the check time itself, so observers must be told when a check ends.
    func updater(_ updater: SPUUpdater, didFinishUpdateCycleFor updateCheck: SPUUpdateCheck, error: (any Error)?) {
        withMutation(keyPath: \.lastCheckDate) {}
        let kind: UpdateLogFilter.Kind = switch updateCheck {
        case .updates: .userStarted
        case .updatesInBackground: .background
        default: .information
        }
        switch UpdateLogFilter.action(kind: kind, error: error) {
        case .skip: break
        case .info(let message, let once): EditLog.record(.info, message, category: "Update", once: once)
        case .error(let message, let once): EditLog.record(.error, message, category: "Update", once: once)
        }
    }

    func updater(_ updater: SPUUpdater, didFindValidUpdate item: SUAppcastItem) {
        EditLog.record(.info, "Update found: version \(item.displayVersionString)", category: "Update")
    }

    func updater(_ updater: SPUUpdater, didDownloadUpdate item: SUAppcastItem) {
        EditLog.record(.info, "Update downloaded: version \(item.displayVersionString)", category: "Update")
    }

    func updater(_ updater: SPUUpdater, willInstallUpdate item: SUAppcastItem) {
        EditLog.record(.info, "Installing update: version \(item.displayVersionString)", category: "Update")
    }

    func updater(_ updater: SPUUpdater, willDownloadUpdate item: SUAppcastItem, with request: NSMutableURLRequest) {
        UpdateFeed.prepareDownload(request)
    }

    /// Also covers Sparkle's scheduled checks, which run whether or not anyone is connected.
    func updater(_ updater: SPUUpdater, mayPerform updateCheck: SPUUpdateCheck) throws {
        let kind: UpdateGate.Kind = updateCheck == .updatesInBackground ? .background : .manual
        if let refusal = gate.refusal(for: kind, feed: feedURL) {
            throw UpdateLogFilter.refusalError(refusal)
        }
        refreshSession()
    }
}
