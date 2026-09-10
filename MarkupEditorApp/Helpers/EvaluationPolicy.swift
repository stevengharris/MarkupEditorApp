//
//  EvaluationPolicy.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 9/9/26.
//

import Foundation

/// Pure elapsed-time policy for the evaluation-version time limit.
enum EvaluationPolicy {

    static let evaluationPeriodDays = 14

    /// The instant the evaluation period ends for a given first-launch date.
    static func expirationDate(from firstLaunch: Date, calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: evaluationPeriodDays, to: firstLaunch) ?? .distantFuture
    }

    /// Whether the evaluation period has ended as of `now`.
    static func isExpired(firstLaunch: Date, now: Date, calendar: Calendar = .current) -> Bool {
        now >= expirationDate(from: firstLaunch, calendar: calendar)
    }
}
