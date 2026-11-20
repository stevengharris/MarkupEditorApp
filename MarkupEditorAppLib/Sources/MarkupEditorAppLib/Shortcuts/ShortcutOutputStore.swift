//
//  ShortcutOutputStore.swift
//  MarkupEditorAppLib
//

import Foundation

/// The full output of Shortcut runs, one text file per run in `runs` under the shortcuts folder.
public struct ShortcutOutputStore: Sendable {
    public let directory: URL

    /// How many run files are kept; older ones are deleted after each write.
    public static let keptFiles = 20
    /// How many trailing lines `tail(of:lines:)` returns by default.
    public static let tailLineCount = 50
    /// Longest sanitised Shortcut name, so a name of wide characters stays under the file name limit.
    static let nameLimit = 50

    public init(directory: URL) {
        self.directory = directory
    }

    public static var standard: ShortcutOutputStore {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return ShortcutOutputStore(directory: support.appendingPathComponent("shortcuts"))
    }

    private var runsDirectory: URL { directory.appendingPathComponent("runs") }

    /// Writes `output` to `<Shortcut name>-<yyyyMMdd-HHmmss>.txt` and returns its URL. A name already taken in
    /// the same second gets a numeric suffix.
    public func write(output: String, shortcutName: String, date: Date = Date(), timeZone: TimeZone = .current) throws -> URL {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.timeZone = timeZone
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let stem = "\(Self.sanitised(shortcutName))-\(formatter.string(from: date))"
        let manager = FileManager.default
        do {
            try manager.createDirectory(at: runsDirectory, withIntermediateDirectories: true)
            var url = runsDirectory.appendingPathComponent("\(stem).txt")
            var suffix = 2
            while manager.fileExists(atPath: url.path) {
                url = runsDirectory.appendingPathComponent("\(stem)-\(suffix).txt")
                suffix += 1
            }
            try Data(output.utf8).write(to: url, options: .atomic)
            prune(keeping: url)
            return url
        } catch {
            throw ShortcutOutputError.writeFailed(error.localizedDescription)
        }
    }

    /// The last `lines` lines of `output`, joined with newlines and without a trailing one. Windows line
    /// endings count as one break.
    public static func tail(of output: String, lines: Int = tailLineCount) -> String {
        guard lines > 0 else { return "" }
        var text = output.replacingOccurrences(of: "\r\n", with: "\n")
        if text.hasSuffix("\n") { text.removeLast() }
        return text.split(separator: "\n", omittingEmptySubsequences: false).suffix(lines).joined(separator: "\n")
    }

    /// `name` with every character that is not a letter, digit, hyphen or underscore replaced by a hyphen,
    /// repeats collapsed, the ends trimmed and the length limited. "shortcut" when nothing is left.
    static func sanitised(_ name: String) -> String {
        var result = ""
        for character in name {
            let keep = character.isLetter || character.isNumber || character == "-" || character == "_"
            let next: Character = keep ? character : "-"
            if next == "-" && result.last == "-" { continue }
            result.append(next)
        }
        let trimmed = String(result.prefix(nameLimit)).trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return trimmed.isEmpty ? "shortcut" : trimmed
    }

    /// Deletes all but the newest `keptFiles` files, never the one just written.
    private func prune(keeping keep: URL) {
        let manager = FileManager.default
        let keys: [URLResourceKey] = [.contentModificationDateKey]
        guard let files = try? manager.contentsOfDirectory(at: runsDirectory, includingPropertiesForKeys: keys) else { return }
        let dated = files.map { ($0, (try? $0.resourceValues(forKeys: Set(keys)).contentModificationDate) ?? .distantPast) }
        let newestFirst = dated.sorted { $0.1 != $1.1 ? $0.1 > $1.1 : $0.0.lastPathComponent > $1.0.lastPathComponent }
        for (file, _) in newestFirst.dropFirst(Self.keptFiles) where file != keep {
            try? manager.removeItem(at: file)
        }
    }
}
