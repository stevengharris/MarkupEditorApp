//
//  EvaluationManager.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 9/10/26.
//

#if EVAL_VERSION
import Foundation

struct EvaluationManager {
    
    private static let evaluationPeriodDays = 14

    static var firstLaunchDate: Date? {
        get { UserDefaults.standard.object(forKey: MarkupEditorApp.firstLaunchDateKey) as? Date }
        set(value) { if firstLaunchDate == nil { UserDefaults.standard.set(value, forKey: MarkupEditorApp.firstLaunchDateKey) } }
    }

    /// Set the firstLaunchDate only if it has not been set before
    static func recordFirstLaunch(_ date: Date) {
        firstLaunchDate = date
    }

    /// The date the evaluation period ends.
    static func expirationDate() -> Date {
        guard let firstLaunchDate else { return .distantFuture }
        return Calendar.current.date(byAdding: .day, value: evaluationPeriodDays, to: firstLaunchDate) ?? .distantFuture
    }

    /// Whether the evaluation period has ended as of `Date.now`.
    static func isExpired() -> Bool {
        Date.now >= expirationDate()
    }
}
#endif
