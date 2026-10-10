//
//  NetworkConnectivity.swift
//  MarkupEditorAppLib
//

import Foundation
import Network

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
