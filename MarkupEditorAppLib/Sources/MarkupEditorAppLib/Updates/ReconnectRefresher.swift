//
//  ReconnectRefresher.swift
//  MarkupEditorAppLib
//

import Foundation
import Observation

/// Re-confirms the member session when connectivity returns after the site could
/// not be reached, so a launch made offline doesn't wait for a relaunch or Try Again.
@MainActor
public final class ReconnectRefresher {

    private let model: SubscriptionModel
    private var listening: Task<Void, Never>?

    /// - Parameter connectivity: `true` when the network is reachable, `false` when it is not.
    public init(model: SubscriptionModel, connectivity: AsyncStream<Bool>) {
        self.model = model
        listening = Task { [weak self] in
            for await online in connectivity {
                await self?.connectivityChanged(online: online)
            }
        }
    }

    /// Returns once the connectivity stream has ended and every update has been handled.
    func finished() async {
        await listening?.value
    }

    private func connectivityChanged(online: Bool) async {
        guard online else { return }
        // A request already in flight, such as the launch refresh, decides the state first.
        if model.isWorking { await waitUntilIdle() }
        guard case .unavailable = model.state, !model.isWorking else { return }
        await model.refresh()
    }

    private func waitUntilIdle() async {
        let model = model
        for await working in Observations({ model.isWorking }) where !working { return }
    }
}
