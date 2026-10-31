//
//  FrontMatterPreservationTests.swift
//  MarkupEditorAppTests
//
//  Covers keeping the original front matter text when the parsed values are unchanged.
//

import Testing
import Foundation
@testable import MarkupEditorApp

/// A document whose metadata is what loading `frontMatter` would produce.
@MainActor
private func loadedDocument(frontMatter: String) -> MarkupDocument {
    let doc = MarkupDocument()
    var warnings: [String] = []
    let inner = frontMatter
        .components(separatedBy: "\n")
        .dropFirst()
        .prefix { $0 != "---" }
        .joined(separator: "\n")
    doc.metadata = YAMLMetadata.parse(inner, warnings: &warnings)
    doc.recordFrontMatter(frontMatter)
    return doc
}

@MainActor struct FrontMatterPreservationTests {

    @Test func quotedValuesKept() {
        let text = "---\naccepted_date: \"2026-03-01\"\ntitle: 'Hello'\n---\n\n"
        let doc = loadedDocument(frontMatter: text)
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == text + "Body\n")
    }

    @Test func keyOrderKept() {
        let text = "---\nzeta: 1\nalpha: 2\n---\n\n"
        let doc = loadedDocument(frontMatter: text)
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == text + "Body\n")
    }

    @Test func commentsKept() {
        let text = "---\n# a comment\ntitle: Hi\n\ntags: [a, b]\n---\n\n"
        let doc = loadedDocument(frontMatter: text)
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == text + "Body\n")
    }

    @Test(arguments: ["", "\n", "\n\n"])
    func gapAfterFenceKept(gap: String) {
        let text = "---\ntitle: Hi\n---\n" + gap
        let doc = loadedDocument(frontMatter: text)
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == text + "Body\n")
    }

    @Test func crlfTextKeptByteForByte() {
        let text = "---\r\ntitle: Hi\r\n---\r\n\r\n"
        let doc = MarkupDocument()
        var warnings: [String] = []
        doc.metadata = YAMLMetadata.parse("title: Hi", warnings: &warnings)
        doc.recordFrontMatter(text)
        #expect(doc.injectYAMLFrontMatter(into: "Body\r\n", preserve: true) == text + "Body\r\n")
    }

    @Test func editedValueRegenerates() {
        let doc = loadedDocument(frontMatter: "---\ntitle: \"Hi\"\n---\n\n")
        doc.metadata = [MetadataTuple(key: "title", value: .scalar("Changed"))]
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == "---\ntitle: Changed\n---\n\nBody\n")
    }

    @Test func emptyFrontMatterKept() {
        let text = "---\n---\n\n"
        let doc = loadedDocument(frontMatter: text)
        #expect(doc.metadata.isEmpty)
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == text + "Body\n")
    }

    @Test func noRecordGivesTodaysOutput() {
        let doc = MarkupDocument()
        doc.metadata = [MetadataTuple(key: "title", value: .scalar("Hi"))]
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == "---\ntitle: Hi\n---\n\nBody\n")
        let empty = MarkupDocument()
        #expect(empty.injectYAMLFrontMatter(into: "Body\n", preserve: true) == "Body\n")
    }

    @Test func preserveFalseGivesTodaysOutput() {
        let doc = loadedDocument(frontMatter: "---\ntitle: \"Hi\"\n---\n\n\n")
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: false) == "---\ntitle: Hi\n---\n\nBody\n")
        #expect(doc.injectYAMLFrontMatter(into: "Body\n") == "---\ntitle: Hi\n---\n\nBody\n")
    }

    @Test func resetClearsRecord() {
        let doc = loadedDocument(frontMatter: "---\ntitle: \"Hi\"\n---\n\n\n")
        doc.reset()
        doc.metadata = [MetadataTuple(key: "title", value: .scalar("Hi"))]
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == "---\ntitle: Hi\n---\n\nBody\n")
    }

    @Test func recordingNilClearsRecord() {
        let doc = loadedDocument(frontMatter: "---\ntitle: \"Hi\"\n---\n\n")
        doc.recordFrontMatter(nil)
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == "---\ntitle: Hi\n---\n\nBody\n")
    }

    @Test func recordingDoesNotMarkTheDocumentChanged() {
        let doc = MarkupDocument()
        doc.recordFrontMatter("---\ntitle: Hi\n---\n\n")
        #expect(doc.hasChanges == false)
        #expect(doc.metadata.isEmpty)
    }

    @Test func recordRefreshedAfterSave() {
        let doc = loadedDocument(frontMatter: "---\ntitle: \"Hi\"\n---\n\n")
        doc.metadata = [MetadataTuple(key: "title", value: .scalar("Changed"))]
        let saved = "---\ntitle: Changed\n---\n\n"
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == saved + "Body\n")
        // A save sets the base text, then the rebase reports the front matter that was written.
        doc.setBaseText(saved + "Body\n")
        // Until the rebase answers, the pre-save record must not survive: values back to "Hi" would match it.
        doc.metadata = [MetadataTuple(key: "title", value: .scalar("Hi"))]
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == "---\ntitle: Hi\n---\n\nBody\n")
        doc.metadata = [MetadataTuple(key: "title", value: .scalar("Changed"))]
        doc.applyRebase(tag: "tag", frontMatter: saved)
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == saved + "Body\n")
    }

    @Test func recordRefreshedAfterSourceReturn() {
        let doc = loadedDocument(frontMatter: "---\ntitle: \"Hi\"\n---\n\n")
        // The source view held hand-edited quoting; leaving it reloads metadata from that text.
        let edited = "---\ntitle: 'Hi'\n---\n\n"
        doc.setBaseText(edited + "Body\n")
        doc.applyRebase(tag: "tag", frontMatter: edited)
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == edited + "Body\n")
    }

    @Test func textWithoutAClosingFenceRecordsNothing() {
        let doc = MarkupDocument()
        doc.metadata = [MetadataTuple(key: "title", value: .scalar("Hi"))]
        doc.recordFrontMatter("---\ntitle: Hi\n")
        #expect(doc.injectYAMLFrontMatter(into: "Body\n", preserve: true) == "---\ntitle: Hi\n---\n\nBody\n")
    }
}
