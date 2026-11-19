//
//  CurrentDocumentState.swift
//  MarkupEditorAppLib
//

import Foundation

/// What the app publishes about the document it is editing, for `markup current`.
public struct CurrentDocumentState: Codable, Equatable, Sendable {
    public static let currentVersion = 1

    public var version: Int
    /// The saved file, or nil for an untitled document.
    public var path: String?
    /// Whether the editor holds changes the file on disk does not.
    public var modified: Bool
    /// The app's process, so a file left by a crash can be told from a live one.
    public var pid: Int32
    public var updated: Date

    public init(path: String?, modified: Bool, pid: Int32, updated: Date) {
        self.version = Self.currentVersion
        self.path = path
        self.modified = modified
        self.pid = pid
        self.updated = updated
    }

    private enum CodingKeys: String, CodingKey {
        case version, path, modified, pid, updated
    }

    public func encode(to encoder: any Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(version, forKey: .version)
        try container.encode(path, forKey: .path)
        try container.encode(modified, forKey: .modified)
        try container.encode(pid, forKey: .pid)
        try container.encode(updated, forKey: .updated)
    }

    public func encoded() throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(self)
    }

    public static func decode(from data: Data) throws -> CurrentDocumentState {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return try decoder.decode(CurrentDocumentState.self, from: data)
    }
}
