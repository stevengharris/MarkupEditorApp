//
//  MetadataValue.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/29/26.
//

enum MetadataValue: Sendable {
    case scalar(String)
    case array([String])
}

extension MetadataValue: Equatable {
    nonisolated static func == (lhs: MetadataValue, rhs: MetadataValue) -> Bool {
        switch (lhs, rhs) {
        case (.scalar(let a), .scalar(let b)): return a == b
        case (.array(let a), .array(let b)): return a == b
        default: return false
        }
    }
}
