//
//  UpdateLogFilter.swift
//  MarkupEditorAppLib
//

import Foundation

/// Decides what the end of an update cycle adds to the log. Pure, so it is tested without Sparkle.
public enum UpdateLogFilter {

    public enum Kind: Sendable {
        case userStarted
        case background
        case information
    }

    public enum Action: Equatable, Sendable {
        case skip
        case info(String, once: String?)
        case error(String, once: String?)
    }

    /// Domain of the error the app throws to refuse a check.
    public static let refusalDomain = "com.stevengharris.MarkupEditorApp.updates"
    static let refusalNotConnectedCode = 1
    static let refusalInvalidFeedCode = 2

    static let sparkleDomain = "SUSparkleErrorDomain"
    static let noUpdateCode = 1001
    static let downloadErrorCode = 2001
    static let installationCanceledCode = 4007
    static let installationAuthorizeLaterCode = 4008
    static let noUpdateReasonKey = "SUNoUpdateFoundReason"

    static let invalidFeedKey = "update-invalid-feed"
    static let offlineKey = "update-offline"

    /// The error the app throws from `mayPerform` to refuse a check.
    public static func refusalError(_ refusal: UpdateGate.Refusal) -> NSError {
        switch refusal {
        case .notConnected:
            NSError(domain: refusalDomain, code: refusalNotConnectedCode, userInfo: [
                NSLocalizedDescriptionKey: "Updates require a connected markupeditor.app subscription."])
        case .invalidFeed:
            NSError(domain: refusalDomain, code: refusalInvalidFeedCode, userInfo: [
                NSLocalizedDescriptionKey: "The update feed override is not a valid URL."])
        }
    }

    /// What the end of a cycle of the given kind adds to the log. A nil error is a normal end; the
    /// found, downloaded and about-to-install entries come from separate hooks.
    public static func action(kind: Kind, error: (any Error)?) -> Action {
        guard let error else { return .skip }
        let nsError = error as NSError
        switch (nsError.domain, nsError.code) {
        case (refusalDomain, refusalNotConnectedCode):
            return .skip
        case (refusalDomain, refusalInvalidFeedCode):
            return .error(nsError.localizedDescription, once: invalidFeedKey)
        case (sparkleDomain, installationCanceledCode), (sparkleDomain, installationAuthorizeLaterCode):
            return .skip
        case (sparkleDomain, noUpdateCode):
            return kind == .information ? .skip : .info(noUpdateMessage(nsError), once: nil)
        default:
            if isNetworkUnavailable(nsError) {
                return .info("Could not check for updates: no network connection", once: offlineKey)
            }
            let what = nsError.domain == sparkleDomain && nsError.code == downloadErrorCode ? "Update download failed" : "Update check failed"
            return .error("\(what): \(nsError.localizedDescription)", once: nil)
        }
    }

    /// Sparkle reports why no update was found; only the version reasons mean there is nothing newer.
    private static func noUpdateMessage(_ error: NSError) -> String {
        switch (error.userInfo[noUpdateReasonKey] as? NSNumber)?.intValue {
        case 3: "No update available: this version of macOS is too old"
        case 4: "No update available: this version of macOS is too new"
        case 5: "No update available: the latest version requires an Apple silicon Mac"
        default: "Checked for updates: up to date"
        }
    }

    /// Only errors that mean this Mac has no connection. A host that cannot be found or does not answer is
    /// a feed problem, so it stays an error.
    private static let unavailableURLErrorCodes: Set<Int> = [
        NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost,
        NSURLErrorInternationalRoamingOff, NSURLErrorDataNotAllowed,
    ]

    /// Sparkle wraps the transport error, so the underlying errors are followed too.
    static func isNetworkUnavailable(_ error: NSError) -> Bool {
        var current: NSError? = error
        while let candidate = current {
            if candidate.domain == NSURLErrorDomain, unavailableURLErrorCodes.contains(candidate.code) { return true }
            current = candidate.userInfo[NSUnderlyingErrorKey] as? NSError
        }
        return false
    }
}
