//
//  PluginVersion.swift
//  MarkupEditorAppLib
//

import Foundation

/// Comparison of dotted plugin versions such as "1.2.0".
public enum PluginVersion {

    /// Whether `version` is newer than `installed`. Components are compared as numbers from the left, and
    /// a missing component counts as zero, so "1.2" and "1.2.0" are the same. A pre-release or build suffix
    /// on a component is ignored. A version that does not start with a number is never newer or older.
    public static func isNewer(_ version: String, than installed: String) -> Bool {
        guard let new = components(of: version), let old = components(of: installed) else { return false }
        for index in 0..<max(new.count, old.count) {
            let a = index < new.count ? new[index] : 0
            let b = index < old.count ? old[index] : 0
            if a != b { return a > b }
        }
        return false
    }

    private static func components(of version: String) -> [Int]? {
        let parts = version.trimmingCharacters(in: .whitespaces).split(separator: ".", omittingEmptySubsequences: false)
        let numbers = parts.map { Int($0.prefix { $0.isNumber }) }
        guard let first = numbers.first, first != nil else { return nil }
        return numbers.map { $0 ?? 0 }
    }
}
