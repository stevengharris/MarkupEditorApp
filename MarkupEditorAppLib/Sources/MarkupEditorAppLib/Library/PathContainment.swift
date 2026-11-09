//
//  PathContainment.swift
//  MarkupEditorAppLib
//

import Foundation

/// Decides whether one path is below another without touching the file system.
///
/// `URL.standardizedFileURL` drops a leading `/private` only for a path that exists, so a file about to be
/// written and its existing folder can be spelled differently. Comparing resolved path components, with
/// `/private/tmp`, `/private/var` and `/private/etc` folded into their short forms, treats both the same.
public enum PathContainment {

    /// True when `url` is strictly below `folder`.
    public static func isInside(_ url: URL, of folder: URL) -> Bool {
        let base = components(of: folder)
        let target = components(of: url)
        return target.count > base.count && Array(target.prefix(base.count)) == base
    }

    static func components(of url: URL) -> [String] {
        var result: [String] = []
        for part in url.pathComponents where part != "/" && part != "." && !part.isEmpty {
            if part == ".." { _ = result.popLast() } else { result.append(part) }
        }
        if result.count > 1, result[0] == "private", ["tmp", "var", "etc"].contains(result[1]) {
            result.removeFirst()
        }
        return result
    }
}
