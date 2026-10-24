//
//  AssistantInstructionsTests.swift
//  MarkupEditorAppLibTests
//

import Testing
@testable import MarkupEditorAppLib

struct AssistantInstructionsTests {

    @Test func theTextCoversImagesTheCacheAndTheLimits() {
        let text = AssistantInstructions.text
        for required in ["bare file name", "same folder as the document", "private cache folder", "reopen the document", "eval_js", "source view", "get_document before"] {
            #expect(text.contains(required), Comment(rawValue: required))
        }
    }

    @Test func everyToolItNamesExists() {
        for name in ["get_document", "replace_blocks", "save_document", "eval_js", "open_document"] {
            #expect(AssistantInstructions.text.contains(name))
        }
        for name in ["get_document", "replace_blocks", "save_document", "eval_js"] {
            #expect(ControlTools.named(name) != nil, Comment(rawValue: name))
        }
    }
}
