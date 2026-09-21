//
//  PluginBanner.swift
//  MarkupEditorAppLib
//

import Foundation

public enum PluginBannerError: Error, Equatable, LocalizedError {
    case unreadable
    case missing
    case invalidJSON
    case invalid(field: String)

    public var errorDescription: String? {
        switch self {
        case .unreadable: "The file could not be read."
        case .missing: "This file isn't a MarkupEditor plugin: its first line is not a plugin banner."
        case .invalidJSON: "The plugin banner at the start of this file is malformed."
        case .invalid(let field): "The plugin banner has a missing or invalid “\(field)”."
        }
    }
}

/// The identity a built plugin declares on the first line of its JS file:
/// `/*! markupeditor-plugin {"name":"EPUB","type":"exporter","ext":"epub"} */`. It is read as
/// text, without running the plugin, so a file can be checked before it is installed.
public struct PluginBanner: Equatable, Sendable {

    public enum Kind: String, Sendable {
        case exporter
        case codeview

        /// How the kind reads in a message to the user.
        public var displayName: String {
            switch self {
            case .exporter: "exporter"
            case .codeview: "codeview"
            }
        }
    }

    public let name: String
    public let kind: Kind
    /// The default file extension of an exporter, without a leading dot; nil for a codeview.
    public let ext: String?

    public init(name: String, kind: Kind, ext: String?) {
        self.name = name
        self.kind = kind
        self.ext = ext
    }

    private static let prefix = "/*! markupeditor-plugin "
    private static let suffix = " */"
    /// A banner is one short line; a first line longer than this is not one.
    private static let readLimit = 8192

    /// Parses the banner from the first line of `source`, tolerating a leading BOM, CRLF line
    /// endings and trailing whitespace. Only "\n" ends the line, so a Unicode line separator
    /// inside the JSON is ordinary text.
    public static func parse(_ source: String) throws(PluginBannerError) -> PluginBanner {
        var scalars = source.unicodeScalars
        if scalars.first == "\u{FEFF}" { scalars.removeFirst() }
        var line = String.UnicodeScalarView(scalars.prefix { $0 != "\n" })
        while let last = line.last, last.properties.isWhitespace { line.removeLast() }
        let firstLine = String(line)
        guard firstLine.hasPrefix(prefix), firstLine.hasSuffix(suffix), firstLine.count >= prefix.count + suffix.count else {
            throw .missing
        }
        let json = String(firstLine.dropFirst(prefix.count).dropLast(suffix.count))

        let object: Any
        do {
            object = try JSONSerialization.jsonObject(with: Data(json.utf8))
        } catch {
            throw .invalidJSON
        }
        guard let fields = object as? [String: Any] else { throw .invalidJSON }

        // Both end up inside a comment in the file.
        func stringField(_ key: String) -> String? {
            // A literal search: String.contains compares Characters, so "*/" followed by a
            // combining mark would go unnoticed.
            guard let value = fields[key] as? String, !value.isEmpty, value.range(of: "*/", options: .literal) == nil else { return nil }
            return value
        }
        guard let name = stringField("name") else { throw .invalid(field: "name") }
        guard let type = fields["type"] as? String, let kind = Kind(rawValue: type) else { throw .invalid(field: "type") }
        switch kind {
        case .codeview:
            return PluginBanner(name: name, kind: kind, ext: nil)
        case .exporter:
            guard let ext = stringField("ext"), !ext.hasPrefix(".") else { throw .invalid(field: "ext") }
            return PluginBanner(name: name, kind: kind, ext: ext)
        }
    }

    /// Reads the banner from the file at `url` without loading the rest of it. The caller holds
    /// any security-scoped access the URL needs.
    public static func read(from url: URL) throws(PluginBannerError) -> PluginBanner {
        let data: Data
        do {
            let handle = try FileHandle(forReadingFrom: url)
            defer { try? handle.close() }
            data = try handle.read(upToCount: readLimit) ?? Data()
        } catch {
            throw .unreadable
        }
        if data.count == readLimit, !data.contains(0x0A) { throw .missing }
        return try parse(String(decoding: data, as: UTF8.self))
    }
}
