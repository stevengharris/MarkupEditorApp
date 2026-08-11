//
//  PluginCatalogTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

@MainActor
struct PluginCatalogDecodingTests {

    // Reads the actual committed plugins/plugins.json directly off disk, located
    // relative to this test file's own source path, so there is no separate copy
    // that can drift from what the generator actually produces.
    static func realPluginsJSONData() throws -> Data {
        let thisFile = URL(fileURLWithPath: #filePath)
        let repoRoot = thisFile
            .deletingLastPathComponent() // MarkupEditorAppTests/
            .deletingLastPathComponent() // repo root
        let pluginsJSON = repoRoot.appendingPathComponent("plugins/plugins.json")
        return try Data(contentsOf: pluginsJSON)
    }

    @Test func decodesRealCommittedPluginsJSON() throws {
        let data = try Self.realPluginsJSONData()
        let catalog = try JSONDecoder().decode(PluginCatalog.self, from: data)

        let mermaid = try #require(catalog.codeview["Mermaid"])
        #expect(mermaid.name == "Mermaid")
        #expect(mermaid.filename == "markupeditor-codeview-mermaid.js")
        #expect(mermaid.ext == nil)

        let docx = try #require(catalog.exporter["DocX"])
        #expect(docx.name == "DocX")
        #expect(docx.ext == "docx")
    }

    @Test func malformedEntrySkippedOthersStillDecode() throws {
        let json = """
        {"codeview":{
          "Mermaid":{"name":"Mermaid","filename":"m.js","description":"d","author":"a","version":"1.0.0","repo":"https://example.com/mermaid","source":"https://example.com/s.js"},
          "Broken":{"name":"Broken"}
        }}
        """
        let data = try #require(json.data(using: .utf8))
        let catalog = try JSONDecoder().decode(PluginCatalog.self, from: data)

        #expect(catalog.codeview.count == 1)
        #expect(catalog.codeview["Mermaid"] != nil)
        #expect(catalog.codeview["Broken"] == nil)
    }

    @Test func entryWithNonHttpsSourceIsSkippedLikeAnyOtherMalformedEntry() throws {
        let json = """
        {"codeview":{
          "Mermaid":{"name":"Mermaid","filename":"m.js","description":"d","author":"a","version":"1.0.0","repo":"https://example.com/mermaid","source":"https://example.com/m.js"},
          "Evil":{"name":"Evil","filename":"e.js","description":"d","author":"a","version":"1.0.0","repo":"https://example.com/evil","source":"javascript:alert(1)"}
        }}
        """
        let data = try #require(json.data(using: .utf8))
        let catalog = try JSONDecoder().decode(PluginCatalog.self, from: data)

        #expect(catalog.codeview.count == 1)
        #expect(catalog.codeview["Mermaid"] != nil)
        #expect(catalog.codeview["Evil"] == nil)
    }

    @Test func entryWithNonHttpsRepoIsSkippedLikeAnyOtherMalformedEntry() throws {
        let json = """
        {"codeview":{
          "Mermaid":{"name":"Mermaid","filename":"m.js","description":"d","author":"a","version":"1.0.0","repo":"https://example.com/mermaid","source":"https://example.com/s.js"},
          "Evil":{"name":"Evil","filename":"e.js","description":"d","author":"a","version":"1.0.0","repo":"javascript:alert(1)","source":"https://example.com/s.js"}
        }}
        """
        let data = try #require(json.data(using: .utf8))
        let catalog = try JSONDecoder().decode(PluginCatalog.self, from: data)

        #expect(catalog.codeview.count == 1)
        #expect(catalog.codeview["Mermaid"] != nil)
        #expect(catalog.codeview["Evil"] == nil)
    }

    @Test func invalidTopLevelJSONThrows() {
        let data = Data("not json".utf8)
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(PluginCatalog.self, from: data)
        }
    }

    @Test func topLevelJSONArrayThrows() {
        // Syntactically valid JSON, but not the expected keyed-object shape.
        let data = Data("[]".utf8)
        #expect(throws: (any Error).self) {
            try JSONDecoder().decode(PluginCatalog.self, from: data)
        }
    }

    @Test func missingBucketDecodesEmptyRatherThanThrowing() throws {
        let json = """
        {"codeview":{"Mermaid":{"name":"Mermaid","filename":"m.js","description":"d","author":"a","version":"1.0.0","repo":"https://example.com/mermaid","source":"https://example.com/s.js"}}}
        """
        let data = try #require(json.data(using: .utf8))
        let catalog = try JSONDecoder().decode(PluginCatalog.self, from: data)

        #expect(catalog.codeview.count == 1)
        #expect(catalog.exporter.isEmpty)
    }
}
