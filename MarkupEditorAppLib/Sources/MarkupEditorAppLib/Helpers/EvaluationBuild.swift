//
//  EvaluationBuild.swift
//  MarkupEditorAppLib
//

import Foundation

/// The running Evaluation build, as far as the evaluation period is concerned.
public struct EvaluationBuild: Equatable, Sendable {
    public var major: Int
    public var minor: Int
    public var build: String
    /// Set for a Beta build: the length of its evaluation period.
    public var betaDays: Int?

    public var isBeta: Bool { betaDays != nil }

    public init(major: Int, minor: Int, build: String, betaDays: Int?) {
        self.major = major
        self.minor = minor
        self.build = build
        self.betaDays = betaDays
    }

    /// `version` is `major.minor.patch`; anything that does not parse reads as 0.0.
    public init(version: String, build: String, betaDays: Int?) {
        let parts = version.split(separator: ".").map { Int($0) }
        let major = parts.indices.contains(0) ? parts[0] : nil
        let minor = parts.indices.contains(1) ? parts[1] : nil
        self.init(major: major ?? 0, minor: minor ?? 0, build: build, betaDays: betaDays)
    }

    public static var current: EvaluationBuild {
        EvaluationBuild(version: BuildVariant.version, build: BuildVariant.build, betaDays: BuildVariant.evaluationBetaDays)
    }
}
