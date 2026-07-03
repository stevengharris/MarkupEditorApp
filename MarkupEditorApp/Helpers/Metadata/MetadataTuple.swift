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

    var description: String { "\(key): \(value)" }

    init(key: String, value: MetadataValue) {
        self.key = key
        self.value = value
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
