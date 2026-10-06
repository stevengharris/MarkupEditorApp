//
//  UpdateFeed.swift
//  MarkupEditorAppLib
//

import Foundation

/// Where the app looks for updates, and the member cookies that unlock the feed.
public enum UpdateFeed {

    public static let productionURL = URL(literal: "https://www.markupeditor.app/appcast/")

    /// The feed to use: production when `override` is nil, `override` when it is an
    /// http(s) URL, and nil when it is set but unusable, so a mistyped override
    /// disables checks rather than reaching production.
    public static func url(override: String?) -> URL? {
        URLOverride.resolve(override, default: productionURL)
    }

    /// As `url(override:)` for a raw defaults value: any non-nil value is a set
    /// override, and one that isn't a string is unusable.
    public static func url(overrideValue: Any?) -> URL? {
        URLOverride.resolve(overrideValue, default: productionURL)
    }

    /// Request headers carrying the stored cookies for `url`'s site, or none when
    /// there are no such cookies.
    public static func headers(for url: URL, cookies storage: HTTPCookieStorage) -> [String: String] {
        HTTPCookie.requestHeaderFields(with: storage.cookies(for: url) ?? [])
    }

    /// Removes the member session from an update download. Only the feed is gated,
    /// and the site redirects downloads to its file storage host, which would
    /// otherwise receive the cookie.
    public static func prepareDownload(_ request: NSMutableURLRequest) {
        request.setValue(nil, forHTTPHeaderField: "Cookie")
    }
}
