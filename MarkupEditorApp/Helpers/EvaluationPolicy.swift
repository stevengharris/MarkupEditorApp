//
//  EvaluationPolicy.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 9/9/26.
//

import Foundation

/// Pure elapsed-time policy for the evaluation-version time limit. No Keychain,
/// no AppKit -- intentionally not gated behind `#if EVAL_VERSION` so it stays
/// testable from MarkupEditorAppTests without an EVAL_VERSION build; only its
/// callers are gated.
enum EvaluationPolicy {

    static let evaluationPeriodDays = 14

    /// The instant the evaluation period ends for a given first-launch date.
    /// Calendar-based day arithmetic, not `firstLaunch + 14*86400` seconds --
    /// the latter shifts by an hour across a DST transition, which would make
    /// the displayed end date and the actual cutoff disagree.
    static func expirationDate(from firstLaunch: Date, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: evaluationPeriodDays, to: firstLaunch) ?? firstLaunch
    }

    /// Whether the evaluation period has ended as of `now`. Inclusive at the
    /// boundary: exactly 14 days elapsed counts as expired. A `firstLaunch` in
    /// the future (system clock moved backward after the Keychain write) is
    /// deliberately never expired -- this mechanism fails toward "keeps
    /// working," never toward "expires immediately."
    static func isExpired(firstLaunch: Date, now: Date, calendar: Calendar = .current) -> Bool {
        now >= expirationDate(from: firstLaunch, calendar: calendar)
    }
}
