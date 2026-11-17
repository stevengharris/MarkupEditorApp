//
//  EvaluationRecord.swift
//  MarkupEditorAppLib
//

import Foundation

/// The evaluation period in force, and the build that started it.
public struct EvaluationRecord: Equatable, Sendable {
    public var start: Date
    public var days: Int
    public var isBeta: Bool
    public var major: Int
    public var minor: Int
    public var build: String

    public init(start: Date, days: Int, isBeta: Bool, major: Int, minor: Int, build: String) {
        self.start = start
        self.days = days
        self.isBeta = isBeta
        self.major = major
        self.minor = minor
        self.build = build
    }

    public func expiry(calendar: Calendar = .current) -> Date {
        calendar.date(byAdding: .day, value: days, to: start) ?? .distantFuture
    }
}
