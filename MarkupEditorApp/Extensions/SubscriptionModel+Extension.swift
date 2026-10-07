//
//  SubscriptionModel+Extension.swift
//  MarkupEditorApp
//

import Foundation
import MarkupEditorAppLib

/// App-side wiring for the shared `SubscriptionModel`: it talks to the markupeditor.app member
/// site and tells `UpdateManager` when a paid member is connected. Debug builds can point it at
/// another Ghost site.
extension SubscriptionModel {

#if DEBUG
    /// UserDefaults key pointing a debug build at another Ghost site.
    static let siteURLOverrideKey = "MemberSiteURLOverride"
#endif

    /// Drives update checks: they run only while a paid member is connected.
    static let shared = SubscriptionModel(
        service: memberService,
        paidDidChange: { UpdateManager.shared.canCheck = $0 },
        applyFirstPaidDefaults: {
            UpdateManager.shared.automaticallyChecks = true
            UpdateManager.shared.automaticallyDownloads = false
        })

    /// Re-confirms the member session when the network returns after the site was unreachable.
    static let reconnectRefresher = ReconnectRefresher(model: shared, connectivity: NetworkConnectivity.updates())

    private static var memberService: MemberService {
#if DEBUG
        guard let url = URLOverride.resolve(UserDefaults.standard.object(forKey: siteURLOverrideKey), default: MemberClient.defaultBaseURL) else {
            return UnavailableMemberService(reason: "the \(siteURLOverrideKey) override is not an http(s) URL")
        }
        return MemberClient(baseURL: url)
#else
        return MemberClient()
#endif
    }
}
