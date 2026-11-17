//
//  EvaluationManager.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 9/10/26.
//

#if EVAL_VERSION
import Foundation
import MarkupEditorAppLib

struct EvaluationManager {

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
        return Calendar.current.date(byAdding: .day, value: EvaluationStore().days, to: firstLaunchDate) ?? .distantFuture
    }

    /// Restarts the evaluation period when the running build calls for it, and records the first launch.
    /// Logs a warning saying why a restart happened. Run once per launch, before the expiry is checked.
    static func refreshForLaunch(now: Date = .now) {
        let build = EvaluationBuild.current
        let store = EvaluationStore()
        let result = EvaluationPolicy.resolve(stored: store.load(), build: build, now: now)
        store.save(result.record)
        guard let reset = result.reset else { return }
        let ends = result.record.expiry().formatted(date: .abbreviated, time: .shortened)
        let message = switch reset {
        case .beta: "The evaluation restarted for this Beta build. It ends \(ends)."
        case .afterBeta: "The evaluation restarted for this release build, keeping the time left on the Beta. It ends \(ends)."
        case .newVersion: "The evaluation restarted for version \(build.major).\(build.minor). It ends \(ends)."
        }
        EditLog.shared.warning(message, category: "Evaluation")
    }

    /// Whether the evaluation had ended when the app launched, after any restart this build calls for.
    static func isExpiredAtLaunch() -> Bool {
        refreshForLaunch()
        return isExpired()
    }

    /// Whether the evaluation period has ended as of `Date.now`.
    static func isExpired() -> Bool {
        Date.now >= expirationDate()
    }
}
#endif
