//
//  QueryValueEncoding.swift
//  MarkupEditorAppLib
//

import Foundation

/// Percent-encodes a value for a URL query so that only unreserved ASCII characters stay as they are.
enum QueryValueEncoding {
    private static let unreserved = CharacterSet(charactersIn: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~")

    static func encode(_ value: String) -> String {
        value.addingPercentEncoding(withAllowedCharacters: unreserved) ?? ""
    }
}
