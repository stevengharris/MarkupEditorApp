//
//  EvaluationPolicy.swift
//  MarkupEditorAppLib
//

import Foundation

/// Decides whether the running build restarts the evaluation period.
public enum EvaluationPolicy {

    public static func resolve(stored: EvaluationRecord?, build: EvaluationBuild, now: Date,
                               calendar: Calendar = .current) -> (record: EvaluationRecord, reset: EvaluationReset?) {
        guard let stored else { return (fresh(for: build, now: now), nil) }
        if build.isBeta {
            guard stored.build != build.build else { return (stored, nil) }
            return (fresh(for: build, now: now), .beta)
        }
        if stored.isBeta {
            var record = fresh(for: build, now: now)
            record.days = max(BuildVariant.evaluationPeriodDays, remainingDays(of: stored, now: now, calendar: calendar))
            return (record, .afterBeta)
        }
        if (build.major, build.minor) > (stored.major, stored.minor) {
            return (fresh(for: build, now: now), .newVersion)
        }
        return (stored, nil)
    }

    private static func fresh(for build: EvaluationBuild, now: Date) -> EvaluationRecord {
        EvaluationRecord(start: now, days: build.betaDays ?? BuildVariant.evaluationPeriodDays, isBeta: build.isBeta,
                         major: build.major, minor: build.minor, build: build.build)
    }

    /// Whole days left, counting a part of a day as a day; 0 once the period has ended.
    private static func remainingDays(of record: EvaluationRecord, now: Date, calendar: Calendar) -> Int {
        let seconds = record.expiry(calendar: calendar).timeIntervalSince(now)
        guard seconds > 0 else { return 0 }
        return Int((seconds / 86_400).rounded(.up))
    }
}
