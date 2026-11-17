//
//  EvaluationStore.swift
//  MarkupEditorAppLib
//

import Foundation

/// Keeps the evaluation record in UserDefaults. The start date stays under
/// `BuildVariant.firstLaunchDateKey`, so a record written before the other keys existed still reads.
public struct EvaluationStore {

    static let daysKey = "evaluationDays"
    static let isBetaKey = "evaluationIsBeta"
    static let majorKey = "evaluationMajor"
    static let minorKey = "evaluationMinor"
    static let buildKey = "evaluationBuild"

    private let defaults: UserDefaults

    public init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    /// The stored period length, or the standard one when none is stored.
    public var days: Int {
        let stored = defaults.integer(forKey: Self.daysKey)
        return stored > 0 ? stored : BuildVariant.evaluationPeriodDays
    }

    /// Nil before the first launch is recorded. A record with only a start date was written before the other
    /// keys existed; it is read as a standard record for version 0.0, so any newer build restarts it.
    public func load() -> EvaluationRecord? {
        guard let start = defaults.object(forKey: BuildVariant.firstLaunchDateKey) as? Date else { return nil }
        guard let storedBuild = defaults.string(forKey: Self.buildKey) else {
            return EvaluationRecord(start: start, days: BuildVariant.evaluationPeriodDays, isBeta: false,
                                    major: 0, minor: 0, build: "")
        }
        return EvaluationRecord(start: start, days: days, isBeta: defaults.bool(forKey: Self.isBetaKey),
                                major: defaults.integer(forKey: Self.majorKey), minor: defaults.integer(forKey: Self.minorKey),
                                build: storedBuild)
    }

    public func save(_ record: EvaluationRecord) {
        defaults.set(record.start, forKey: BuildVariant.firstLaunchDateKey)
        defaults.set(record.days, forKey: Self.daysKey)
        defaults.set(record.isBeta, forKey: Self.isBetaKey)
        defaults.set(record.major, forKey: Self.majorKey)
        defaults.set(record.minor, forKey: Self.minorKey)
        defaults.set(record.build, forKey: Self.buildKey)
    }
}
