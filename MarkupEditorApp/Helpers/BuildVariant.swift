//
//  BuildVariant.swift
//  MarkupEditorApp
//

import Foundation

/// Which distribution channel this running binary came from, read from Info.plist keys
/// baked in at build time (MarkupEditorEvalVersion, MarkupEditorUnlimitedVersion). Unlike
/// EvaluationManager's `#if EVAL_VERSION` gating, this never needs to change behavior --
/// it's read in every configuration so it can label itself accurately everywhere,
/// including plain Debug/Release builds that have neither flag set.
enum BuildVariant: Equatable {
    case evaluation
    case unlimited
    case development

    /// Eval takes precedence if both markers were somehow set -- the two are meant to be
    /// mutually exclusive build configurations, but a build should never silently claim
    /// to be the unrestricted Unlimited variant on a technicality.
    static func resolve(from info: [String: Any]?) -> BuildVariant {
        if (info?["MarkupEditorEvalVersion"] as? String) == "YES" {
            return .evaluation
        }
        if (info?["MarkupEditorUnlimitedVersion"] as? String) == "YES" {
            return .unlimited
        }
        return .development
    }

    static var current: BuildVariant {
        resolve(from: Bundle.main.infoDictionary)
    }

    var label: String {
        switch self {
        case .evaluation: "Evaluation"
        case .unlimited: "Unlimited"
        case .development: "Development"
        }
    }
}
