//
//  BuildVariant.swift
//  MarkupEditorAppLib
//

import Foundation

/// Which distribution channel this running binary came from, read from Info.plist keys
/// baked in at build time (MarkupEditorEvalVersion, MarkupEditorUnlimitedVersion). Shared
/// by MarkupEditorApp and MarkupEditorCLI, each of which carries its own copy of those
/// Info.plist keys from the same build settings.
public enum BuildVariant: Equatable {
    case evaluation
    case unlimited
    case development

    /// Eval takes precedence if both markers were somehow set -- the two are meant to be
    /// mutually exclusive build configurations, but a build should never silently claim
    /// to be the unrestricted Unlimited variant on a technicality.
    public static func resolve(from info: [String: Any]?) -> BuildVariant {
        if (info?["MarkupEditorEvalVersion"] as? String) == "YES" {
            return .evaluation
        }
        if (info?["MarkupEditorUnlimitedVersion"] as? String) == "YES" {
            return .unlimited
        }
        return .development
    }

    public static var current: BuildVariant {
        resolve(from: Bundle.main.infoDictionary)
    }

    public var label: String {
        switch self {
        case .evaluation: "Evaluation"
        case .unlimited: "Unlimited"
        case .development: "Development"
        }
    }

    /// Shared by MarkupEditorApp and MarkupEditorCLI -- Bundle.main resolves to whichever
    /// of the two is actually running, so one implementation here is correct for both.
    public static var version: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown"
    }

    public static var build: String {
        Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "unknown"
    }

    public static var versionString: String {
        "\(version) (\(build)) — \(displayLabel(from: Bundle.main.infoDictionary))"
    }

    /// The variant's label, with "Beta" added for an Evaluation build that has a Beta period.
    static func displayLabel(from info: [String: Any]?) -> String {
        let variant = resolve(from: info)
        return variant == .evaluation && evaluationBetaDays(from: info) != nil ? "\(variant.label) Beta" : variant.label
    }

    /// The length of a Beta evaluation build's period, set by the `MarkupEditorEvalBetaDays` Info.plist key.
    /// Nil for any other build, and for a key that is empty, unresolved or not a positive number.
    public static func evaluationBetaDays(from info: [String: Any]?) -> Int? {
        guard let text = info?["MarkupEditorEvalBetaDays"] as? String, let days = Int(text), days > 0 else { return nil }
        return days
    }

    public static var evaluationBetaDays: Int? {
        evaluationBetaDays(from: Bundle.main.infoDictionary)
    }

    /// UserDefaults key holding the date the current evaluation period started.
    public static let firstLaunchDateKey = "firstLaunchDateKey"

    public static let evaluationPeriodDays = 14

    /// The date the evaluation ends: the stored period length after the date it started. Nil for any
    /// other variant, and for the evaluation build before its first launch is recorded.
    public static func expiryDate() -> Date? {
        guard current == .evaluation,
              let firstLaunch = UserDefaults.standard.object(forKey: firstLaunchDateKey) as? Date else { return nil }
        return Calendar.current.date(byAdding: .day, value: EvaluationStore().days, to: firstLaunch)
    }

    /// Whether the evaluation has ended. False for any other variant, and for the evaluation build
    /// before its first launch is recorded.
    public static func isExpired(now: Date = .now) -> Bool {
        isExpired(expiry: expiryDate(), now: now)
    }

    static func isExpired(expiry: Date?, now: Date) -> Bool {
        guard let expiry else { return false }
        return now >= expiry
    }
}
