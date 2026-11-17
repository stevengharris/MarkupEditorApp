//
//  EvaluationPolicyTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct EvaluationPolicyTests {

    private static let calendar: Calendar = {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .gmt
        return calendar
    }()

    private let now = Date(timeIntervalSince1970: 1_800_000_000)

    private func daysAgo(_ days: Int) -> Date {
        Self.calendar.date(byAdding: .day, value: -days, to: now) ?? now
    }

    private func record(startedDaysAgo: Int = 0, days: Int = 14, isBeta: Bool = false,
                        major: Int = 0, minor: Int = 9, build: String = "20260101E") -> EvaluationRecord {
        EvaluationRecord(start: daysAgo(startedDaysAgo), days: days, isBeta: isBeta, major: major, minor: minor, build: build)
    }

    private func build(_ version: String, build: String = "20261116E", betaDays: Int? = nil) -> EvaluationBuild {
        EvaluationBuild(version: version, build: build, betaDays: betaDays)
    }

    private func resolve(_ stored: EvaluationRecord?, _ running: EvaluationBuild) -> (record: EvaluationRecord, reset: EvaluationReset?) {
        EvaluationPolicy.resolve(stored: stored, build: running, now: now, calendar: Self.calendar)
    }

    // MARK: Build and Info.plist parsing

    @Test func versionIsSplitIntoMajorAndMinor() {
        let parsed = build("1.10.3")
        #expect(parsed.major == 1)
        #expect(parsed.minor == 10)
    }

    @Test func unparsableVersionIsZeroZero() {
        let parsed = build("unknown")
        #expect(parsed.major == 0)
        #expect(parsed.minor == 0)
    }

    @Test func betaDaysComeFromTheInfoDictionary() {
        #expect(BuildVariant.evaluationBetaDays(from: ["MarkupEditorEvalBetaDays": "30"]) == 30)
    }

    @Test func onlyAnEvaluationBuildWithBetaDaysIsLabelledBeta() {
        let eval: [String: Any] = ["MarkupEditorEvalVersion": "YES"]
        #expect(BuildVariant.displayLabel(from: eval) == "Evaluation")
        #expect(BuildVariant.displayLabel(from: eval.merging(["MarkupEditorEvalBetaDays": "30"]) { $1 }) == "Evaluation Beta")
        #expect(BuildVariant.displayLabel(from: eval.merging(["MarkupEditorEvalBetaDays": ""]) { $1 }) == "Evaluation")
        #expect(BuildVariant.displayLabel(from: ["MarkupEditorUnlimitedVersion": "YES", "MarkupEditorEvalBetaDays": "30"]) == "Unlimited")
    }

    @Test func emptyUnresolvedOrNonPositiveBetaDaysAreNotABeta() {
        #expect(BuildVariant.evaluationBetaDays(from: nil) == nil)
        #expect(BuildVariant.evaluationBetaDays(from: [:]) == nil)
        #expect(BuildVariant.evaluationBetaDays(from: ["MarkupEditorEvalBetaDays": ""]) == nil)
        #expect(BuildVariant.evaluationBetaDays(from: ["MarkupEditorEvalBetaDays": "$(MARKUPEDITOR_EVAL_BETA_DAYS)"]) == nil)
        #expect(BuildVariant.evaluationBetaDays(from: ["MarkupEditorEvalBetaDays": "0"]) == nil)
        #expect(BuildVariant.evaluationBetaDays(from: ["MarkupEditorEvalBetaDays": "-3"]) == nil)
    }

    // MARK: First launch

    @Test func firstLaunchStartsNowWithTheStandardPeriod() {
        let result = resolve(nil, build("0.9.12"))
        #expect(result.record.start == now)
        #expect(result.record.days == 14)
        #expect(!result.record.isBeta)
        #expect(result.reset == nil)
    }

    @Test func firstLaunchOfABetaUsesTheBetaDays() {
        let result = resolve(nil, build("0.9.13", betaDays: 30))
        #expect(result.record.days == 30)
        #expect(result.record.isBeta)
        #expect(result.reset == nil)
    }

    // MARK: Beta builds

    @Test func aDifferentBetaBuildRestartsWithTheBetaDays() {
        let stored = record(startedDaysAgo: 20, days: 14)
        let result = resolve(stored, build("0.9.13", build: "20261120E", betaDays: 30))
        #expect(result.reset == .beta)
        #expect(result.record.start == now)
        #expect(result.record.days == 30)
        #expect(result.record.isBeta)
        #expect(result.record.build == "20261120E")
    }

    @Test func theSameBetaBuildKeepsItsClock() {
        let stored = record(startedDaysAgo: 10, days: 30, isBeta: true, build: "20261120E")
        let result = resolve(stored, build("0.9.13", build: "20261120E", betaDays: 30))
        #expect(result.reset == nil)
        #expect(result.record == stored)
    }

    @Test func aNewerBetaRestartsEvenWithinTheSameMinorVersion() {
        let stored = record(startedDaysAgo: 25, days: 30, isBeta: true, build: "20261120E")
        let result = resolve(stored, build("0.9.13", build: "20261127E", betaDays: 30))
        #expect(result.reset == .beta)
        #expect(result.record.start == now)
    }

    // MARK: Standard build over a Beta

    @Test func standardOverABetaKeepsTheRemainingBetaDaysWhenTheyAreMoreThanFourteen() {
        let stored = record(startedDaysAgo: 10, days: 40, isBeta: true, build: "20261120E")
        let result = resolve(stored, build("0.9.14"))
        #expect(result.reset == .afterBeta)
        #expect(result.record.days == 30)
        #expect(!result.record.isBeta)
        #expect(result.record.start == now)
    }

    @Test func standardOverABetaWithFewDaysLeftGetsFourteen() {
        let stored = record(startedDaysAgo: 25, days: 30, isBeta: true, build: "20261120E")
        let result = resolve(stored, build("0.9.14"))
        #expect(result.reset == .afterBeta)
        #expect(result.record.days == 14)
    }

    @Test func standardOverAnExpiredBetaGetsFourteen() {
        let stored = record(startedDaysAgo: 60, days: 30, isBeta: true, build: "20261120E")
        let result = resolve(stored, build("0.9.14"))
        #expect(result.reset == .afterBeta)
        #expect(result.record.days == 14)
    }

    @Test func aPartialRemainingDayCountsAsADay() {
        let stored = EvaluationRecord(start: now.addingTimeInterval(-(10 * 86_400) - 3_600), days: 25, isBeta: true,
                                      major: 0, minor: 9, build: "20261120E")
        // 14 days and 23 hours remain; the larger of that rounded up (15) and 14.
        let result = resolve(stored, build("0.9.14"))
        #expect(result.record.days == 15)
    }

    // MARK: Standard builds

    @Test func aHigherMinorVersionRestartsAnExpiredEvaluation() {
        let stored = record(startedDaysAgo: 120, days: 14, major: 0, minor: 9)
        let result = resolve(stored, build("0.10.0"))
        #expect(result.reset == .newVersion)
        #expect(result.record.start == now)
        #expect(result.record.days == 14)
        #expect(result.record.minor == 10)
    }

    @Test func aHigherMajorVersionRestarts() {
        let stored = record(startedDaysAgo: 120, major: 0, minor: 9)
        let result = resolve(stored, build("1.0.0"))
        #expect(result.reset == .newVersion)
        #expect(result.record.major == 1)
        #expect(result.record.minor == 0)
    }

    @Test func aPatchVersionKeepsTheClock() {
        let stored = record(startedDaysAgo: 120, major: 0, minor: 9)
        let result = resolve(stored, build("0.9.30"))
        #expect(result.reset == nil)
        #expect(result.record == stored)
    }

    @Test func anOlderVersionKeepsTheClock() {
        let stored = record(startedDaysAgo: 3, major: 0, minor: 10)
        let result = resolve(stored, build("0.9.12"))
        #expect(result.reset == nil)
        #expect(result.record == stored)
    }

    @Test func aRecordFromBeforeTheFeatureRestartsUnderAnyStandardBuild() {
        let stored = EvaluationRecord(start: daysAgo(120), days: 14, isBeta: false, major: 0, minor: 0, build: "")
        let result = resolve(stored, build("0.9.13"))
        #expect(result.reset == .newVersion)
        #expect(result.record.start == now)
        #expect(result.record.days == 14)
        #expect(result.record.minor == 9)
    }

    @Test func aRecordFromBeforeTheFeatureRestartsUnderABeta() {
        let stored = EvaluationRecord(start: daysAgo(120), days: 14, isBeta: false, major: 0, minor: 0, build: "")
        let result = resolve(stored, build("0.9.13", build: "20261120E", betaDays: 30))
        #expect(result.reset == .beta)
        #expect(result.record.days == 30)
        #expect(result.record.isBeta)
    }

    @Test func aLowerStandardVersionOverABetaRestartsWithTheLargerPeriod() {
        let stored = record(startedDaysAgo: 5, days: 40, isBeta: true, major: 0, minor: 10, build: "20261120E")
        let result = resolve(stored, build("0.9.12"))
        #expect(result.reset == .afterBeta)
        #expect(result.record.days == 35)
        #expect(result.record.minor == 9)
    }

    // MARK: Expiry

    @Test func expiryIsStartPlusDays() {
        let stored = record(startedDaysAgo: 0, days: 30)
        let expected = Self.calendar.date(byAdding: .day, value: 30, to: now)
        #expect(stored.expiry(calendar: Self.calendar) == expected)
    }
}

struct EvaluationStoreTests {

    private func makeDefaults() throws -> UserDefaults {
        let name = "EvaluationStoreTests-\(UUID().uuidString)"
        let defaults = try #require(UserDefaults(suiteName: name))
        defaults.removePersistentDomain(forName: name)
        return defaults
    }

    @Test func nothingStoredIsNil() throws {
        let store = EvaluationStore(defaults: try makeDefaults())
        #expect(store.load() == nil)
    }

    @Test func aSavedRecordIsLoadedUnchanged() throws {
        let store = EvaluationStore(defaults: try makeDefaults())
        let record = EvaluationRecord(start: Date(timeIntervalSince1970: 1_700_000_000), days: 30, isBeta: true,
                                      major: 0, minor: 10, build: "20261120E")
        store.save(record)
        #expect(store.load() == record)
    }

    @Test func aBareStartDateIsReadAsAStandardRecordForVersionZero() throws {
        let defaults = try makeDefaults()
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        defaults.set(start, forKey: BuildVariant.firstLaunchDateKey)
        let loaded = try #require(EvaluationStore(defaults: defaults).load())
        #expect(loaded.start == start)
        #expect(loaded.days == 14)
        #expect(!loaded.isBeta)
        #expect(loaded.major == 0)
        #expect(loaded.minor == 0)
        #expect(loaded.build == "")
    }

    @Test func aBareStartDateFromBeforeTheFeatureRestartsThroughTheStore() throws {
        let defaults = try makeDefaults()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        defaults.set(now.addingTimeInterval(-120 * 86_400), forKey: BuildVariant.firstLaunchDateKey)
        let store = EvaluationStore(defaults: defaults)
        let running = EvaluationBuild(version: "0.9.13", build: "20261120E", betaDays: nil)
        let result = EvaluationPolicy.resolve(stored: store.load(), build: running, now: now)
        #expect(result.reset == .newVersion)
        store.save(result.record)
        #expect(store.load() == result.record)
        #expect(EvaluationPolicy.resolve(stored: store.load(), build: running, now: now).reset == nil)
    }

    @Test func aBareStartDateFromBeforeTheFeatureRestartsUnderABetaThroughTheStore() throws {
        let defaults = try makeDefaults()
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        defaults.set(now.addingTimeInterval(-120 * 86_400), forKey: BuildVariant.firstLaunchDateKey)
        let running = EvaluationBuild(version: "0.9.13", build: "20261120E", betaDays: 30)
        let result = EvaluationPolicy.resolve(stored: EvaluationStore(defaults: defaults).load(), build: running, now: now)
        #expect(result.reset == .beta)
        #expect(result.record.days == 30)
    }

    @Test func savingKeepsTheStartDateUnderTheOriginalKey() throws {
        let defaults = try makeDefaults()
        let start = Date(timeIntervalSince1970: 1_700_000_000)
        EvaluationStore(defaults: defaults).save(EvaluationRecord(start: start, days: 14, isBeta: false, major: 0, minor: 9, build: "x"))
        #expect(defaults.object(forKey: BuildVariant.firstLaunchDateKey) as? Date == start)
    }
}
