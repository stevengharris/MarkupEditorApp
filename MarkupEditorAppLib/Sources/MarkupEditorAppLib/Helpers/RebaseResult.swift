//
//  RebaseResult.swift
//  MarkupEditorAppLib
//

import Foundation

/// What the editor reports after recording a source map from Markdown text, returned as
/// `{ "tag": string|null, "frontMatter": string|null, "lineEnding": string|null, "warnings": [string] }`.
/// A nil `tag` means no map was recorded and a save regenerates the whole document.
public struct RebaseResult: Decodable, Sendable, Equatable {
    public let tag: String?
    public let frontMatter: String?
    public let lineEnding: String?
    public let warnings: [String]

    /// The result for a call that failed or returned something undecodable.
    public static let unrecorded = RebaseResult(tag: nil, frontMatter: nil, lineEnding: nil, warnings: [])

    public static func decode(from jsonString: String?) -> RebaseResult? {
        guard let data = jsonString?.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(RebaseResult.self, from: data)
    }
}
