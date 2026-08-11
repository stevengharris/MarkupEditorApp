//
//  PluginDiscoveryModel.swift
//  MarkupEditorApp
//

import Foundation
import Observation

/// The four states PluginDiscoveryView can be in. A blank screen is never
/// acceptable, so "loaded but nothing there" and "failed to load" are
/// distinct, both-explicit states rather than one of them collapsing into
/// an empty view.
enum PluginDiscoveryState: Equatable {
    case loading
    case content(PluginCatalog)
    case empty
    case failed(String)
}

/// Drives PluginDiscoveryView's fetch/decode lifecycle. `fetch` is injected
/// so the state machine is testable against canned results, with no live
/// network call and no URLSession mock -- the same fetch/decode separation
/// fetchPluginCatalog() was built for.
@Observable
final class PluginDiscoveryModel {
    private(set) var state: PluginDiscoveryState = .loading

    private let fetch: () async throws -> PluginCatalog

    init(fetch: @escaping () async throws -> PluginCatalog = fetchPluginCatalog) {
        self.fetch = fetch
    }

    func load() async {
        state = .loading
        do {
            let catalog = try await fetch()
            state = catalog.codeview.isEmpty && catalog.exporter.isEmpty ? .empty : .content(catalog)
        } catch {
            state = .failed(error.localizedDescription)
        }
    }
}
