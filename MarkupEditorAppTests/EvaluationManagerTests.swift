//
//  EvaluationManagerTests.swift
//  MarkupEditorAppTests
//

import Testing
import Foundation
@testable import MarkupEditorApp

#if EVAL_VERSION
// Tests share one UserDefaults key -- .serialized avoids cross-test races.
@Suite(.serialized)
@MainActor
struct EvaluationManagerTests {

    init() {
        UserDefaults.standard.removeObject(forKey: MarkupEditorApp.firstLaunchDateKey)
    }

    private func setFirstLaunch(daysAgo: Double) {
        UserDefaults.standard.set(Date().addingTimeInterval(-daysAgo * 24 * 60 * 60), forKey: MarkupEditorApp.firstLaunchDateKey)
    }

    @Test func noFirstLaunchDateIsNotExpired() {
        #expect(EvaluationManager.firstLaunchDate == nil)
        #expect(!EvaluationManager.isExpired())
    }

    @Test func zeroElapsedIsNotExpired() {
        setFirstLaunch(daysAgo: 0)
        #expect(!EvaluationManager.isExpired())
    }

    @Test func thirteenDaysIsNotExpired() {
        setFirstLaunch(daysAgo: 13)
        #expect(!EvaluationManager.isExpired())
    }

    @Test func fourteenDaysIsExpired() {
        setFirstLaunch(daysAgo: 14)
        #expect(EvaluationManager.isExpired())
    }

    @Test func fifteenDaysIsExpired() {
        setFirstLaunch(daysAgo: 15)
        #expect(EvaluationManager.isExpired())
    }

    @Test func largeElapsedIsExpired() {
        setFirstLaunch(daysAgo: 100)
        #expect(EvaluationManager.isExpired())
    }

    @Test func futureStoredDateIsNotExpired() {
        // Clock rolled back after the first-launch write -- fails toward
        // "keeps working," never toward "expires immediately."
        UserDefaults.standard.set(Date().addingTimeInterval(30 * 24 * 60 * 60), forKey: MarkupEditorApp.firstLaunchDateKey)
        #expect(!EvaluationManager.isExpired())
    }

    @Test func recordFirstLaunchNeverOverwritesAnExistingDate() throws {
        let original = Date().addingTimeInterval(-5 * 24 * 60 * 60)
        UserDefaults.standard.set(original, forKey: MarkupEditorApp.firstLaunchDateKey)
        EvaluationManager.recordFirstLaunch(Date())
        let stored = try #require(EvaluationManager.firstLaunchDate)
        #expect(abs(stored.timeIntervalSince(original)) < 1)
    }
}
#endif
