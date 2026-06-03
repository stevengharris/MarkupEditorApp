//
//  MetadataTuple.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 6/2/26.
//

class MetadataTuple: Sendable, CustomStringConvertible {
    let key: String
    let value: MetadataValue
    
    var description: String { "\(key): \(value)" }
    
    init(key: String, value: MetadataValue) {
        self.key = key
        self.value = value
    }
    
    static func from(_ string: String) -> MetadataTuple? {
        var warnings: [String] = []
        let tuples = parseYAMLMetadata(string, warnings: &warnings)
        if warnings.count > 0 {
            print("\(warnings)")
        }
        return tuples.count == 1 ? tuples[0] : nil
    }
    
    static func from(key: String, value: String) -> MetadataTuple? {
        from("\(key): \(value)")
    }
}

extension MetadataTuple: Equatable {
    nonisolated static func == (lhs: MetadataTuple, rhs: MetadataTuple) -> Bool {
        lhs.key == rhs.key && lhs.value == rhs.value
    }
}
