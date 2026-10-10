//
//  PluginBannerTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

private let exporterLine = #"/*! markupeditor-plugin {"name":"EPUB","type":"exporter","ext":"epub"} */"#
private let codeViewLine = #"/*! markupeditor-plugin {"name":"Mermaid","type":"codeview"} */"#

struct PluginBannerParseTests {

    @Test func parsesAnExporterBannerFromTheFirstLine() throws {
        let banner = try PluginBanner.parse("\(exporterLine)\nconsole.log(1)\n")
        #expect(banner == PluginBanner(name: "EPUB", kind: .exporter, ext: "epub"))
    }

    @Test func parsesACodeViewBannerWithNoExtension() throws {
        let banner = try PluginBanner.parse("\(codeViewLine)\n")
        #expect(banner == PluginBanner(name: "Mermaid", kind: .codeview, ext: nil))
    }

    @Test func parsesABannerWithNothingAfterIt() throws {
        #expect(try PluginBanner.parse(codeViewLine).name == "Mermaid")
    }

    @Test func toleratesCRLFLineEndingsABOMAndTrailingWhitespace() throws {
        #expect(try PluginBanner.parse("\(exporterLine)\r\nconsole.log(1)\r\n").name == "EPUB")
        #expect(try PluginBanner.parse("\u{FEFF}\(exporterLine)\n").name == "EPUB")
        #expect(try PluginBanner.parse("\(exporterLine)  \t\n").name == "EPUB")
    }

    @Test func readsANameContainingAUnicodeLineSeparatorAndOtherNonASCII() throws {
        let line = "/*! markupeditor-plugin {\"name\":\"A\u{2028}B café\",\"type\":\"codeview\"} */"
        #expect(try PluginBanner.parse(line).name == "A\u{2028}B café")
    }

    @Test func ignoresAnExtensionOnACodeView() throws {
        let line = #"/*! markupeditor-plugin {"name":"V","type":"codeview","ext":"x"} */"#
        #expect(try PluginBanner.parse(line).ext == nil)
    }

    @Test func aBannerOnALaterLineDoesNotCount() {
        #expect(throws: PluginBannerError.missing) { try PluginBanner.parse("console.log(1)\n\(exporterLine)\n") }
        #expect(throws: PluginBannerError.missing) { try PluginBanner.parse("\n\(exporterLine)\n") }
    }

    @Test func reportsMissingWhenTheFirstLineIsNotABanner() {
        #expect(throws: PluginBannerError.missing) { try PluginBanner.parse("console.log(1)\n") }
        #expect(throws: PluginBannerError.missing) { try PluginBanner.parse("") }
        #expect(throws: PluginBannerError.missing) { try PluginBanner.parse("/* markupeditor-plugin {} */\n") }
    }

    @Test func rejectsMalformedJSON() {
        #expect(throws: PluginBannerError.invalidJSON) { try PluginBanner.parse("/*! markupeditor-plugin {oops} */\n") }
        #expect(throws: PluginBannerError.invalidJSON) { try PluginBanner.parse("/*! markupeditor-plugin [1,2] */\n") }
    }

    @Test(arguments: [
        (#"{"type":"codeview"}"#, "name"),
        (#"{"name":"","type":"codeview"}"#, "name"),
        (#"{"name":3,"type":"codeview"}"#, "name"),
        (#"{"name":"A*/B","type":"codeview"}"#, "name"),
        ("{\"name\":\"a*/\u{0301}\",\"type\":\"codeview\"}", "name"),
        ("{\"name\":\"X\",\"type\":\"exporter\",\"ext\":\"a*/\u{0301}\"}", "ext"),
        (#"{"name":"X"}"#, "type"),
        (#"{"name":"X","type":"importer"}"#, "type"),
        (#"{"name":"X","type":"exporter"}"#, "ext"),
        (#"{"name":"X","type":"exporter","ext":""}"#, "ext"),
        (#"{"name":"X","type":"exporter","ext":".epub"}"#, "ext"),
        (#"{"name":"X","type":"exporter","ext":"a*/b"}"#, "ext"),
        (#"{"name":"X","type":"exporter","ext":7}"#, "ext"),
    ])
    func rejectsAnInvalidIdentityNamingTheField(json: String, field: String) {
        do {
            _ = try PluginBanner.parse("/*! markupeditor-plugin \(json) */\n")
            Issue.record("expected \(json) to be rejected")
        } catch {
            #expect(error == .invalid(field: field), "\(json) -> \(error)")
        }
    }

    @Test func kindsReadAsExporterAndCodeviewInMessages() {
        #expect(PluginBanner.Kind.exporter.displayName == "exporter")
        #expect(PluginBanner.Kind.codeview.displayName == "codeview")
    }

    @Test func errorsDescribeThemselvesForTheUser() {
        #expect(PluginBannerError.missing.errorDescription?.contains("banner") == true)
        #expect(PluginBannerError.invalid(field: "ext").errorDescription?.contains("ext") == true)
    }
}

struct PluginBannerReadTests {

    private func write(_ text: String) throws -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("PluginBannerReadTests-\(UUID().uuidString).js")
        try text.write(to: url, atomically: true, encoding: .utf8)
        return url
    }

    @Test func readsTheBannerFromALargeFileWithoutNeedingTheRest() throws {
        let body = String(repeating: "var x = 1;\n", count: 200_000)   // ~2 MB
        let url = try write("\(exporterLine)\n\(body)")
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(try PluginBanner.read(from: url).name == "EPUB")
    }

    @Test func readsAFileThatIsOnlyABannerWithNoNewline() throws {
        let url = try write(codeViewLine)
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(try PluginBanner.read(from: url).name == "Mermaid")
    }

    @Test func reportsUnreadableForAMissingFile() {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("does-not-exist-\(UUID().uuidString).js")
        #expect(throws: PluginBannerError.unreadable) { try PluginBanner.read(from: url) }
    }

    @Test func reportsMissingWhenTheFirstLineIsTooLongToBeABanner() throws {
        let url = try write(String(repeating: "x", count: 100_000) + "\n\(exporterLine)\n")
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(throws: PluginBannerError.missing) { try PluginBanner.read(from: url) }
    }

    @Test func aBannerFollowedByMoreThanTheReadLimitOfSpacesIsNotABanner() throws {
        // The bytes read are the banner plus spaces with no newline; without the length guard
        // trailing whitespace would be trimmed and this would parse as a valid banner.
        let url = try write(codeViewLine + String(repeating: " ", count: 9_000) + "trailing text\n")
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(throws: PluginBannerError.missing) { try PluginBanner.read(from: url) }
    }

    @Test func reportsMissingForAPlainScript() throws {
        let url = try write("export const x = 1\n")
        defer { try? FileManager.default.removeItem(at: url) }
        #expect(throws: PluginBannerError.missing) { try PluginBanner.read(from: url) }
    }
}
