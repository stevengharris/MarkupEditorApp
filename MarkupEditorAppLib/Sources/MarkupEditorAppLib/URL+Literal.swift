//
//  URL+Literal.swift
//  MarkupEditorAppLib
//

import Foundation

extension URL {

    /// For URL literals in source that are known to be valid.
    init(literal: StaticString) {
        guard let url = URL(string: "\(literal)") else {
            preconditionFailure("Invalid URL literal: \(literal)")
        }
        self = url
    }
}
