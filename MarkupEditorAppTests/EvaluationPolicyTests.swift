//
//  EvaluationPolicyTests.swift
//  MarkupEditorAppTests

import Testing
import Foundation
@testable import MarkupEditorApp

// EvaluationPolicy is pure Date math with no Keychain/AppKit dependency, so it
// must not be gated behind #if EVAL_VERSION -- only its callers are. That is
// what makes it reachable here without an EVAL_VERSION build.
@MainActor
struct EvaluationPolicyTests {

    private let calendar = Calendar(identifier: .gregorian)

    // MARK: - isExpired boundary

    @Test func zeroElapsedIsNotExpired() {
        let firstLaunch = Date()
        #expect(!EvaluationPolicy.isExpired(firstLaunch: firstLaunch, now: firstLaunch, calendar: calendar))
    }

    @Test func thirteenDaysIsNotExpired() {
        let firstLaunch = Date()
        let now = firstLaunch.addingTimeInterval(13 * 24 * 60 * 60)
        #expect(!EvaluationPolicy.isExpired(firstLaunch: firstLaunch, now: now, calendar: calendar))
    }

    @Test func exactlyFourteenDaysIsExpired() {
        let firstLaunch = Date()
        let now = EvaluationPolicy.expirationDate(from: firstLaunch, calendar: calendar)
        #expect(EvaluationPolicy.isExpired(firstLaunch: firstLaunch, now: now, calendar: calendar))
    }

    @Test func oneSecondBeforeExpirationIsNotExpired() {
        let firstLaunch = Date()
        let now = EvaluationPolicy.expirationDate(from: firstLaunch, calendar: calendar).addingTimeInterval(-1)
        #expect(!EvaluationPolicy.isExpired(firstLaunch: firstLaunch, now: now, calendar: calendar))
    }

    @Test func fifteenDaysIsExpired() {
        let firstLaunch = Date()
        let now = firstLaunch.addingTimeInterval(15 * 24 * 60 * 60)
        #expect(EvaluationPolicy.isExpired(firstLaunch: firstLaunch, now: now, calendar: calendar))
    }

    @Test func largeElapsedIsExpired() {
        let firstLaunch = Date()
        let now = firstLaunch.addingTimeInterval(100 * 24 * 60 * 60)
        #expect(EvaluationPolicy.isExpired(firstLaunch: firstLaunch, now: now, calendar: calendar))
    }

    // MARK: - Clock moved backward (stored date is in the future)

    @Test func futureStoredDateIsNotExpired() {
        // A first-launch date after "now" -- e.g. the system clock was rolled
        // back after the Keychain write. This mechanism fails toward "keeps
        // working," never "expires immediately," so this must not be treated
        // as an enormous elapsed time.
        let firstLaunch = Date().addingTimeInterval(30 * 24 * 60 * 60)
        let now = Date()
        #expect(!EvaluationPolicy.isExpired(firstLaunch: firstLaunch, now: now, calendar: calendar))
    }

    // MARK: - DST boundary

    @Test func expirationDatePreservesWallClockTimeAcrossFallBackDST() {
        // 2026-10-18 and 2026-11-01 are both confirmed Sundays (verified via
        // `date -j -f "%Y-%m-%d" ... "+%A"`), and 2026-11-01 is the US
        // "fall back" DST-end date (first Sunday of November) -- a real
        // transition, not a synthetic one. Adding 14*86400 seconds to an
        // absolute instant would land one hour off the intended wall-clock
        // time on this specific transition; Calendar-based day arithmetic
        // must not.
        var nyCalendar = Calendar(identifier: .gregorian)
        nyCalendar.timeZone = TimeZone(identifier: "America/New_York")!

        var startComponents = DateComponents()
        startComponents.year = 2026
        startComponents.month = 10
        startComponents.day = 18
        startComponents.hour = 9
        startComponents.minute = 0
        startComponents.second = 0
        let firstLaunch = nyCalendar.date(from: startComponents)!

        let expiration = EvaluationPolicy.expirationDate(from: firstLaunch, calendar: nyCalendar)
        let resultComponents = nyCalendar.dateComponents([.year, .month, .day, .hour, .minute], from: expiration)

        #expect(resultComponents.year == 2026)
        #expect(resultComponents.month == 11)
        #expect(resultComponents.day == 1)
        #expect(resultComponents.hour == 9)
        #expect(resultComponents.minute == 0)
    }
}
