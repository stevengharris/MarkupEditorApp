//
//  ShortcutLinkTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct ShortcutLinkTests {

    @Test func openingAShortcutUsesItsEncodedNameAndABlankNameOpensNothingSpecific() throws {
        let url = try #require(ShortcutLink.openShortcutURL(name: "Publish Post & More"))
        #expect(url.absoluteString == "shortcuts://open-shortcut?name=Publish%20Post%20%26%20More")
        #expect(ShortcutLink.openShortcutURL(name: "") == nil)
        #expect(ShortcutLink.openShortcutURL(name: "  ") == nil)
    }
}
