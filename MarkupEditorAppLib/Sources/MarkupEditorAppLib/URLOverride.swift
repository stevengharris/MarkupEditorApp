//
//  URLOverride.swift
//  MarkupEditorAppLib
//

import Foundation

/// Resolves a debug-build URL override read from user defaults.
public enum URLOverride {

    /// `defaultURL` when `value` is nil, the URL when `value` is an http(s) URL
    /// string, and nil when a value is set but unusable (including a non-string),
    /// so a mistyped override can never fall through to the default.
    public static func resolve(_ value: Any?, default defaultURL: URL) -> URL? {
        guard let value else { return defaultURL }
        guard let string = value as? String, let url = URL(string: string),
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              url.host != nil else {
            return nil
        }
        return url
    }
}
