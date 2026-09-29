//
//  UpdateFeed.swift
//  MarkupEditorAppLib
//

import Foundation

/// Where the app looks for updates, and the member cookies that unlock the feed.
public enum UpdateFeed {

    public static let productionURL = URL(string: "https://www.markupeditor.app/appcast/")!

    /// The feed to use: `override` when it is an http(s) URL, otherwise production.
    public static func url(override: String?) -> URL {
        guard let override, let url = URL(string: override),
              let scheme = url.scheme?.lowercased(), scheme == "http" || scheme == "https",
              url.host != nil else {
            return productionURL
        }
        return url
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
