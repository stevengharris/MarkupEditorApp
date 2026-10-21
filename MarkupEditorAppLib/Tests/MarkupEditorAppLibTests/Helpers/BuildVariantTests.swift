//
//  BuildVariantTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
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

    @Test func expiryDateIsNilOutsideEvaluationBuild() {
        #expect(BuildVariant.current != .evaluation)
        #expect(BuildVariant.expiryDate() == nil)
    }

    @Test func isExpiredIsFalseOutsideEvaluationBuild() {
        #expect(!BuildVariant.isExpired())
    }

    @Test func noExpiryIsNotExpired() {
        #expect(!BuildVariant.isExpired(expiry: nil, now: .now))
    }

    @Test func beforeExpiryIsNotExpired() {
        let now = Date()
        #expect(!BuildVariant.isExpired(expiry: now.addingTimeInterval(60), now: now))
    }

    @Test func atExpiryIsExpired() {
        let now = Date()
        #expect(BuildVariant.isExpired(expiry: now, now: now))
    }

    @Test func afterExpiryIsExpired() {
        let now = Date()
        #expect(BuildVariant.isExpired(expiry: now.addingTimeInterval(-60), now: now))
    }

    @Test func labelsAreDistinct() {
        #expect(BuildVariant.evaluation.label == "Evaluation")
        #expect(BuildVariant.unlimited.label == "Unlimited")
        #expect(BuildVariant.development.label == "Development")
    }
}
