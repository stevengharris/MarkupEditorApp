//
//  PluginsWelcomeModelTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
import MarkupEditorAppLib
@testable import MarkupEditorApp

@MainActor
struct PluginsWelcomeModelTests {

    private static let catalogJSON = """
    {
      "codeview": {
        "Mermaid": {"name": "Mermaid", "filename": "m.js", "description": "Diagrams.", "author": "A", "version": "1.0.0", "repo": "https://example.com/r", "source": "https://example.com/m.js"},
        "GeoJSON": {"name": "GeoJSON", "filename": "g.js", "description": "Maps.", "author": "A", "version": "1.0.0", "repo": "https://example.com/r", "source": "https://example.com/g.js"}
      },
      "exporter": {
        "DocX": {"name": "DocX", "filename": "d.js", "ext": "docx", "description": "Word.", "author": "A", "version": "0.1.0", "repo": "https://example.com/r", "source": "https://example.com/d.js"}
      }
    }
    """

    private static func loadedModel(
        installed: Set<String> = [],
        install: @escaping (PluginCatalogEntry, PluginType) async throws -> Void
    ) async throws -> PluginsWelcomeModel {
        let catalog = try JSONDecoder().decode(PluginCatalog.self, from: Data(catalogJSON.utf8))
        let model = PluginsWelcomeModel(
            discovery: PluginDiscoveryModel(fetch: { catalog }),
            install: install,
            isInstalled: { _, name in installed.contains(name) }
        )
        await model.discovery.load()
        return model
    }

    @Test func entriesAreListedByNameWithinEachGroup() async throws {
        let model = try await Self.loadedModel { _, _ in }
        #expect(model.entries(for: .codeview).map(\.name) == ["GeoJSON", "Mermaid"])
        #expect(model.entries(for: .exporter).map(\.name) == ["DocX"])
    }

    @Test func onlyTheCheckedPluginsAreInstalled() async throws {
        var installed: [String] = []
        let model = try await Self.loadedModel { entry, _ in installed.append(entry.name) }
        let mermaid = try #require(model.entries(for: .codeview).first { $0.name == "Mermaid" })
        let docx = try #require(model.entries(for: .exporter).first)
        model.setSelected(true, entry: mermaid, type: .codeview)
        model.setSelected(true, entry: docx, type: .exporter)

        await model.installSelected()

        #expect(installed == ["Mermaid", "DocX"])
        #expect(model.failures.isEmpty)
        #expect(model.selected.isEmpty)
    }

    @Test func nothingIsInstalledWhenNothingIsChecked() async throws {
        var installed: [String] = []
        let model = try await Self.loadedModel { entry, _ in installed.append(entry.name) }

        await model.installSelected()

        #expect(installed.isEmpty)
    }

    @Test func aCheckedPluginThatIsAlreadyInstalledIsNotInstalledAgain() async throws {
        var installed: [String] = []
        let model = try await Self.loadedModel(installed: ["Mermaid"]) { entry, _ in installed.append(entry.name) }
        let mermaid = try #require(model.entries(for: .codeview).first { $0.name == "Mermaid" })
        model.setSelected(true, entry: mermaid, type: .codeview)

        await model.installSelected()

        #expect(installed.isEmpty)
    }

    @Test func aFailureIsReportedAndTheRemainingPluginsAreStillInstalled() async throws {
        struct Failure: LocalizedError { var errorDescription: String? { "download failed" } }
        var installed: [String] = []
        let model = try await Self.loadedModel { entry, _ in
            if entry.name == "GeoJSON" { throw Failure() }
            installed.append(entry.name)
        }
        let geojson = try #require(model.entries(for: .codeview).first { $0.name == "GeoJSON" })
        let docx = try #require(model.entries(for: .exporter).first)
        model.setSelected(true, entry: geojson, type: .codeview)
        model.setSelected(true, entry: docx, type: .exporter)

        await model.installSelected()

        #expect(installed == ["DocX"])
        #expect(model.failures == ["GeoJSON: download failed"])
        #expect(model.isSelected(geojson, type: .codeview))
    }

    @Test func noPluginsAreListedWhenTheCatalogCannotBeReached() async {
        struct Offline: Error {}
        let model = PluginsWelcomeModel(discovery: PluginDiscoveryModel(fetch: { throw Offline() }))
        await model.discovery.load()

        #expect(model.entries(for: .codeview).isEmpty)
        #expect(model.entries(for: .exporter).isEmpty)
        guard case .failed = model.discovery.state else {
            Issue.record("expected the failed state")
            return
        }
    }
}
