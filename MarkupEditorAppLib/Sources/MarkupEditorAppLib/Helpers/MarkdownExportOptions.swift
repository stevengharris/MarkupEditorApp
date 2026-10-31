//
//  MarkdownExportOptions.swift
//  MarkupEditorAppLib
//

/// Options for `MU.exportMarkdown`. With `preserve` set, blocks unchanged since the base text identified by
/// `tag` are written from their original lines; a `tag` that is nil or does not match gives the regenerated output.
public struct MarkdownExportOptions: Encodable, Sendable, Equatable {
    public let preserve: Bool
    public let tag: String?

    public static func preserving(tag: String?) -> MarkdownExportOptions {
        MarkdownExportOptions(preserve: true, tag: tag)
    }

    enum CodingKeys: String, CodingKey { case preserve, tag }

    /// Encodes a nil `tag` as JSON null rather than omitting it.
    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encode(preserve, forKey: .preserve)
        try container.encode(tag, forKey: .tag)
    }
}
