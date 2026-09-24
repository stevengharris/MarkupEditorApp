//
//  SubscriptionModel+App.swift
//  MarkupEditorApp
//

import Foundation
import MarkupEditorAppLib

extension SubscriptionModel {

#if DEBUG
    /// UserDefaults key pointing a debug build at another Ghost site.
    static let siteURLOverrideKey = "MemberSiteURLOverride"
#endif

    /// Drives update checks: they run only while a paid member is connected.
    static let shared = SubscriptionModel(
        service: MemberClient(baseURL: siteURL),
        paidDidChange: { UpdateManager.shared.canCheck = $0 },
        applyFirstPaidDefaults: {
            UpdateManager.shared.automaticallyChecks = true
            UpdateManager.shared.automaticallyDownloads = false
        })

    private static var siteURL: URL {
#if DEBUG
        if let override = UserDefaults.standard.string(forKey: siteURLOverrideKey), let url = URL(string: override) {
            return url
        }
#endif
        return MemberClient.defaultBaseURL
    }
}
