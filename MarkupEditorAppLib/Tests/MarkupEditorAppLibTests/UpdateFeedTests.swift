//
//  UpdateFeedTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

struct UpdateFeedTests {

    @Test func noOverrideIsProductionFeed() {
        #expect(UpdateFeed.url(override: nil) == UpdateFeed.productionURL)
        #expect(UpdateFeed.productionURL.absoluteString == "https://www.markupeditor.app/appcast.xml")
    }

    @Test func httpOverrideIsUsed() {
        #expect(UpdateFeed.url(override: "http://127.0.0.1:8321/appcast.xml").absoluteString == "http://127.0.0.1:8321/appcast.xml")
    }

    @Test(arguments: ["", "not a url", "file:///tmp/appcast.xml", "ftp://example.test/appcast.xml"])
    func unusableOverrideFallsBackToProduction(override: String) {
        #expect(UpdateFeed.url(override: override) == UpdateFeed.productionURL)
    }

    static func storage(_ cookies: [(name: String, domain: String)]) -> HTTPCookieStorage {
        let storage = HTTPCookieStorage.sharedCookieStorage(forGroupContainerIdentifier: UUID().uuidString)
        for (name, domain) in cookies {
            if let cookie = HTTPCookie(properties: [.name: name, .value: "\(name)-value", .domain: domain, .path: "/"]) {
                storage.setCookie(cookie)
            }
        }
        return storage
    }

    @Test func headersCarrySiteCookiesOnly() {
        let storage = Self.storage([("ghost-members-ssr", "www.markupeditor.app"),
                                    ("ghost-members-ssr.sig", "www.markupeditor.app"),
                                    ("other", "elsewhere.test")])

        let cookie = UpdateFeed.headers(for: UpdateFeed.productionURL, cookies: storage)["Cookie"] ?? ""

        #expect(cookie.contains("ghost-members-ssr=ghost-members-ssr-value"))
        #expect(cookie.contains("ghost-members-ssr.sig=ghost-members-ssr.sig-value"))
        #expect(!cookie.contains("other"))
    }

    @Test func noCookiesMeansNoHeaders() {
        #expect(UpdateFeed.headers(for: UpdateFeed.productionURL, cookies: Self.storage([])).isEmpty)
    }
}
