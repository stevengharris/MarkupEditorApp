//
//  BlocksReply.swift
//  MarkupEditorAppLib
//

import Foundation

/// A failure to get a usable answer from the editor's block functions.
public enum ContentBridgeError: Error, Equatable, LocalizedError {
    case noResult(String)
    case undecodable(function: String, raw: String)

    public var errorDescription: String? {
        switch self {
        case .noResult(let function):
            return "The editor returned no result from \(function)."
        case .undecodable(let function, let raw):
            return "The editor's answer from \(function) could not be read: \(raw.prefix(200))"
        }
    }
}

/// What `MU.getBlocks` returns: a page of the document's blocks, or a refusal with a reason.
public struct BlocksReply: Decodable, Sendable, Equatable {
    public var ok: Bool
    public var reason: String?
    public var blocks: [ContentBlock]
    public var count: Int
    public var firstEditable: Int
    public var next: Int?

    private enum CodingKeys: String, CodingKey { case ok, reason, blocks, count, firstEditable, next }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
        blocks = try container.decodeIfPresent([ContentBlock].self, forKey: .blocks) ?? []
        count = try container.decodeIfPresent(Int.self, forKey: .count) ?? 0
        firstEditable = try container.decodeIfPresent(Int.self, forKey: .firstEditable) ?? 0
        next = try container.decodeIfPresent(Int.self, forKey: .next)
    }

    /// Decodes the JSON the editor function returned.
    public static func decode(_ raw: Any?, function: String = "getBlocks") throws(ContentBridgeError) -> BlocksReply {
        try decodeReply(raw, function: function)
    }
}

extension ReplaceResult {
    /// Decodes the JSON `MU.replaceBlocks` returned.
    public static func decode(_ raw: Any?, function: String = "replaceBlocks") throws(ContentBridgeError) -> ReplaceResult {
        try decodeReply(raw, function: function)
    }
}

extension ProposeResult {
    /// Decodes the JSON `MU.proposeEdits` returned.
    public static func decode(_ raw: Any?, function: String = "proposeEdits") throws(ContentBridgeError) -> ProposeResult {
        try decodeReply(raw, function: function)
    }
}

extension SuggestionList {
    /// Decodes the JSON `MU.listSuggestions` returned.
    public static func decode(_ raw: Any?, function: String = "listSuggestions") throws(ContentBridgeError) -> SuggestionList {
        try decodeReply(raw, function: function)
    }
}

private func decodeReply<T: Decodable>(_ raw: Any?, function: String) throws(ContentBridgeError) -> T {
    guard let text = raw as? String else { throw .noResult(function) }
    do {
        return try JSONDecoder().decode(T.self, from: Data(text.utf8))
    } catch {
        throw .undecodable(function: function, raw: text)
    }
}

extension SelectionResult {
    /// Decodes the JSON `MU.selectText` returned.
    public static func decode(_ raw: Any?, function: String = "selectText") throws(ContentBridgeError) -> SelectionResult {
        try decodeReply(raw, function: function)
    }
}
