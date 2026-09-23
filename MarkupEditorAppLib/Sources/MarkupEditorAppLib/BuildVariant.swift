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
        "\(version) (\(build)) — \(current.label)"
    }
}
