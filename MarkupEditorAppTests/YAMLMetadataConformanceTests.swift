//
//  YAMLMetadataConformanceTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
@testable import MarkupEditorApp

/// Runs the frontmatter cases shared with the JS parser (plugin-kit/src/metadata.js) through
/// `YAMLMetadata.parse`. The fixture is read from the repository by path.
struct FrontmatterCase: Decodable, Sendable, CustomTestStringConvertible {

    enum Value: Decodable, Sendable, Equatable {
        case scalar(String)
        case array([String])

        init(from decoder: Decoder) throws {
            let container = try decoder.singleValueContainer()
            if let text = try? container.decode(String.self) {
                self = .scalar(text)
            } else {
                self = .array(try container.decode([String].self))
            }
        }
    }

    struct Entry: Decodable, Sendable, Equatable {
        let key: String
        let value: Value
    }

    let name: String
    let yaml: String
    let entries: [Entry]

    var testDescription: String { name }
}

private struct FrontmatterFixture: Decodable {
    let cases: [FrontmatterCase]
}

private let fixtureURL = URL(fileURLWithPath: #filePath)
    .deletingLastPathComponent().deletingLastPathComponent()
    .appendingPathComponent("plugin-kit/test/fixtures/frontmatter.json")

private func loadCases() -> [FrontmatterCase] {
    guard let data = try? Data(contentsOf: fixtureURL),
          let fixture = try? JSONDecoder().decode(FrontmatterFixture.self, from: data) else { return [] }
    return fixture.cases
}

@MainActor private func entries(_ tuples: [MetadataTuple]) -> [FrontmatterCase.Entry] {
    tuples.map { tuple in
        switch tuple.value {
        case .scalar(let text): FrontmatterCase.Entry(key: tuple.key, value: .scalar(text))
        case .array(let items): FrontmatterCase.Entry(key: tuple.key, value: .array(items))
        }
    }
}

@MainActor
struct YAMLMetadataConformanceTests {

    @Test func theFixtureLoads() {
        #expect(loadCases().count > 0, "no cases loaded from \(fixtureURL.path)")
    }

    @Test(arguments: loadCases())
    func parsesTheSharedCase(_ testCase: FrontmatterCase) {
        var warnings: [String] = []
        let parsed = YAMLMetadata.parse(testCase.yaml, warnings: &warnings)
        #expect(entries(parsed) == testCase.entries)
    }

    /// What the parser reads, the serializer must write in a form the parser reads back unchanged.
    @Test(arguments: loadCases())
    func serializedCaseParsesBackToTheSameEntries(_ testCase: FrontmatterCase) {
        var warnings: [String] = []
        let parsed = YAMLMetadata.parse(testCase.yaml, warnings: &warnings)
        let reparsed = YAMLMetadata.parse(YAMLMetadata.serialize(parsed), warnings: &warnings)
        #expect(entries(reparsed) == testCase.entries)
    }
}
