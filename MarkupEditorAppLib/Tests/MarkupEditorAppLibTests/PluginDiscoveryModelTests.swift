//
//  PluginDiscoveryModelTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

@MainActor
struct PluginDiscoveryModelTests {

    private static func catalog(from json: String) throws -> PluginCatalog {
        let data = try #require(json.data(using: .utf8))
        return try JSONDecoder().decode(PluginCatalog.self, from: data)
    }

    @Test func initialStateIsLoadingBeforeLoadIsCalled() {
        let model = PluginDiscoveryModel(fetch: { throw PluginCatalogError.transportFailure("unused") })
        #expect(model.state == .loading)
    }

    @Test func successfulFetchWithEntriesYieldsContentState() async throws {
        let catalog = try Self.catalog(from: """
            {"codeview":{"Mermaid":{"name":"Mermaid","filename":"m.js","description":"d","author":"a","version":"1.0.0","repo":"https://example.com","source":"https://example.com/m.js"}}}
            """)
        let model = PluginDiscoveryModel(fetch: { catalog })

        await model.load()

        #expect(model.state == .content(catalog))
    }

    @Test func successfulFetchWithNoEntriesAnywhereYieldsEmptyState() async throws {
        let catalog = try Self.catalog(from: "{}")
        let model = PluginDiscoveryModel(fetch: { catalog })

        await model.load()

        #expect(model.state == .empty)
    }

    @Test func throwingFetchYieldsFailedStateCarryingAMessage() async {
        let model = PluginDiscoveryModel(fetch: { throw PluginCatalogError.unexpectedStatus(404) })

        await model.load()

        guard case .failed(let message) = model.state else {
            Issue.record("expected .failed state, got \(model.state)")
            return
        }
        #expect(message.contains("404"))
    }
}
