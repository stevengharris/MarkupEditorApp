//
//  BuildVariantTests.swift
//  MarkupEditorAppLibTests
//

import Testing
@testable import MarkupEditorAppLib

struct BuildVariantTests {

    @Test func noMarkersIsDevelopment() {
        #expect(BuildVariant.resolve(from: [:]) == .development)
    }

    @Test func nilInfoDictionaryIsDevelopment() {
        #expect(BuildVariant.resolve(from: nil) == .development)
    }

    @Test func evalMarkerIsEvaluation() {
        #expect(BuildVariant.resolve(from: ["MarkupEditorEvalVersion": "YES"]) == .evaluation)
    }

    @Test func unlimitedMarkerIsUnlimited() {
        #expect(BuildVariant.resolve(from: ["MarkupEditorUnlimitedVersion": "YES"]) == .unlimited)
    }

    @Test func unresolvedBuildSettingLiteralIsDevelopment() {
        // A config that never defines the build setting substitutes nothing,
        // so Xcode leaves the literal unexpanded rather than resolving to "".
        #expect(BuildVariant.resolve(from: ["MarkupEditorEvalVersion": "$(MARKUPEDITOR_EVAL_VERSION)"]) == .development)
    }

    @Test func bothMarkersSetPrefersEvaluation() {
        let info = ["MarkupEditorEvalVersion": "YES", "MarkupEditorUnlimitedVersion": "YES"]
        #expect(BuildVariant.resolve(from: info) == .evaluation)
    }

    @Test func labelsAreDistinct() {
        #expect(BuildVariant.evaluation.label == "Evaluation")
        #expect(BuildVariant.unlimited.label == "Unlimited")
        #expect(BuildVariant.development.label == "Development")
    }
}
