//
//  MetadataTuple.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/2/26.
//

import OSLog

private let logger = Logger(subsystem: "com.stevengharris.MarkupEditorApp", category: "Metadata")

struct MetadataTuple: Sendable, Equatable, CustomStringConvertible {
    let key: String
    let value: MetadataValue
    /// The quotes each scalar, or each element of an array, was written in where it was parsed from, nil for
    /// none. Empty when that is not known, as for a value built in code. Used only to write the value back the
    /// way it was written, so a quoted `"2026-03-01"` stays a string and an unquoted `2026-03-01` stays a date.
    /// Not part of equality.
    let quoted: [QuoteStyle?]

    var description: String { "\(key): \(value)" }

    init(key: String, value: MetadataValue, quoted: [QuoteStyle?] = []) {
        self.key = key
        self.value = value
        self.quoted = quoted
    }

    static func == (lhs: MetadataTuple, rhs: MetadataTuple) -> Bool {
        lhs.key == rhs.key && lhs.value == rhs.value
    }

    static func from(_ string: String) -> MetadataTuple? {
        var warnings: [String] = []
        let tuples = YAMLMetadata.parse(string, warnings: &warnings)
        if warnings.count > 0 {
            logger.warning("\(warnings)")
        }
        return tuples.count == 1 ? tuples[0] : nil
    }

    static func from(key: String, value: String) -> MetadataTuple? {
        from("\(key): \(value)")
    }
}
