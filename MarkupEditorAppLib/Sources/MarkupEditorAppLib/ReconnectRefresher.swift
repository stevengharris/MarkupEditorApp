//
//  ReconnectRefresher.swift
//  MarkupEditorAppLib
//

import Foundation
import Network
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
        while model.isWorking {
            await withCheckedContinuation { continuation in
                withObservationTracking { _ = model.isWorking } onChange: { continuation.resume() }
            }
        }
    }
}

/// Reachability updates from the system, as the stream `ReconnectRefresher` takes.
public enum NetworkConnectivity {

    /// Emits the current reachability, then every change, until the stream is dropped. Only the
    /// latest update is kept, so a flapping connection can't queue a request per change.
    public static func updates() -> AsyncStream<Bool> {
        AsyncStream(Bool.self, bufferingPolicy: .bufferingNewest(1)) { continuation in
            let monitor = NWPathMonitor()
            monitor.pathUpdateHandler = { path in
                continuation.yield(path.status == .satisfied)
            }
            continuation.onTermination = { _ in monitor.cancel() }
            monitor.start(queue: DispatchQueue(label: "MarkupEditorAppLib.NetworkConnectivity"))
        }
    }
}
