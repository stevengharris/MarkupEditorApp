//
//  MarkdownExportOptionsTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct MarkdownExportOptionsTests {

    private func json(_ options: MarkdownExportOptions) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = .sortedKeys
        return String(decoding: try encoder.encode(options), as: UTF8.self)
    }

    @Test func aNilTagEncodesAsNull() throws {
        #expect(try json(.preserving(tag: nil)) == #"{"preserve":true,"tag":null}"#)
    }

    @Test func aTagEncodesAsAString() throws {
        #expect(try json(.preserving(tag: "abc")) == #"{"preserve":true,"tag":"abc"}"#)
    }
}
