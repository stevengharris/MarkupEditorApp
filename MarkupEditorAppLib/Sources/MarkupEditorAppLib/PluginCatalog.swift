//
//  PluginCatalog.swift
//  MarkupEditorAppLib
//

import Foundation
import OSLog

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorAppLib", category: "PluginCatalog")

// TEMPORARY host: MarkupEditorApp is currently a private repo, so
// raw.githubusercontent.com 404s against it. markupeditor-desktop is a
// confirmed-public stand-in used until MarkupEditorApp itself goes public.
// Mirrors the same constant in plugins/generate-plugins-json.js.
private let pluginsJSONURLString =
    "https://raw.githubusercontent.com/stevengharris/markupeditor-desktop/main/plugins/plugins.json"

/// One plugin entry as published in plugins.json.
public struct PluginCatalogEntry: Decodable, Equatable, Sendable, Identifiable {
    public var id: String { name }
    public let name: String
    public let filename: String
    public let description: String
    public let author: String
    public let version: String
    public let repo: String
    public let source: String
    public let ext: String?
}

/// Wraps a per-entry decode so one malformed entry never fails the whole
/// dictionary decode -- Swift's synthesized Decodable for [String: T] throws
/// on the first bad value and abandons everything else in the dictionary.
private struct FailableDecodable<T: Decodable>: Decodable {
    let result: Result<T, any Error>

    init(from decoder: any Decoder) throws {
        do {
            result = .success(try T(from: decoder))
        } catch {
            result = .failure(error)
        }
    }
}

/// The plugin discovery catalog fetched from plugins.json, grouped by type.
///
/// A malformed individual entry is skipped and logged, not thrown -- a bad
/// hand-edit to one plugin's data should not take down the whole catalog. A
/// missing "codeview" or "exporter" key decodes as empty, not as an error,
/// since the generator only emits buckets that actually have plugins. A
/// malformed top level (not an object, or not valid JSON at all) still
/// throws, since that is not a per-entry problem.
public struct PluginCatalog: Decodable, Equatable, Sendable {
    public let codeview: [String: PluginCatalogEntry]
    public let exporter: [String: PluginCatalogEntry]

    private enum CodingKeys: String, CodingKey {
        case codeview, exporter
    }

    public init(from decoder: any Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        codeview = try Self.decodeBucket(container, forKey: .codeview)
        exporter = try Self.decodeBucket(container, forKey: .exporter)
    }

    private static func decodeBucket(
        _ container: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) throws -> [String: PluginCatalogEntry] {
        guard let raw = try container.decodeIfPresent([String: FailableDecodable<PluginCatalogEntry>].self, forKey: key) else {
            return [:]
        }
        var entries: [String: PluginCatalogEntry] = [:]
        for (name, wrapped) in raw {
            switch wrapped.result {
            case .success(let entry):
                guard entry.repo.hasPrefix("https://") else {
                    logger.warning("Skipping plugin catalog entry \"\(name)\" in \"\(key.stringValue)\": repo is not an https:// URL")
                    continue
                }
                guard entry.source.hasPrefix("https://") else {
                    logger.warning("Skipping plugin catalog entry \"\(name)\" in \"\(key.stringValue)\": source is not an https:// URL")
                    continue
                }
                entries[name] = entry
            case .failure(let error):
                logger.warning("Skipping malformed plugin catalog entry \"\(name)\" in \"\(key.stringValue)\": \(error.localizedDescription)")
            }
        }
        return entries
    }
}

public enum PluginCatalogError: Error, Equatable, Sendable {
    case transportFailure(String)
    case unexpectedStatus(Int)
    case undecodableResponse(String)
}

extension PluginCatalogError: LocalizedError {
    public var errorDescription: String? {
        switch self {
        case .transportFailure(let reason):
            return "Could not reach the plugin catalog: \(reason)"
        case .unexpectedStatus(let code):
            return "Plugin catalog request failed with status \(code)."
        case .undecodableResponse(let reason):
            return "Plugin catalog response could not be understood: \(reason)"
        }
    }
}

/// Fetches and decodes plugins.json. A transport failure, a non-2xx status, or
/// an undecodable response all throw -- the caller must never receive an
/// empty catalog as a stand-in for "the fetch failed."
public func fetchPluginCatalog() async throws -> PluginCatalog {
    guard let url = URL(string: pluginsJSONURLString) else {
        throw PluginCatalogError.transportFailure("invalid plugin catalog URL")
    }

    let data: Data
    let response: URLResponse
    do {
        (data, response) = try await URLSession.shared.data(from: url)
    } catch {
        throw PluginCatalogError.transportFailure(error.localizedDescription)
    }

    guard let httpResponse = response as? HTTPURLResponse else {
        throw PluginCatalogError.transportFailure("non-HTTP response")
    }
    guard (200...299).contains(httpResponse.statusCode) else {
        throw PluginCatalogError.unexpectedStatus(httpResponse.statusCode)
    }

    do {
        return try JSONDecoder().decode(PluginCatalog.self, from: data)
    } catch {
        throw PluginCatalogError.undecodableResponse(error.localizedDescription)
    }
}
