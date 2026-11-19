//
//  ShortcutOutputStoreTests.swift
//  MarkupEditorAppLibTests
//

import Testing
import Foundation
@testable import MarkupEditorAppLib

struct ShortcutOutputStoreTests {

    private func scratch() throws -> (store: ShortcutOutputStore, runs: URL, cleanup: () -> Void) {
        let root = FileManager.default.temporaryDirectory.appendingPathComponent("ShortcutOutputStoreTests-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let directory = root.appendingPathComponent("shortcuts")
        return (ShortcutOutputStore(directory: directory), directory.appendingPathComponent("runs"),
                { try? FileManager.default.removeItem(at: root) })
    }

    private let date = Date(timeIntervalSince1970: 1_700_000_000)

    private func write(_ store: ShortcutOutputStore, _ output: String = "out", name: String = "Publish", at date: Date? = nil) throws -> URL {
        try store.write(output: output, shortcutName: name, date: date ?? self.date, timeZone: TimeZone(identifier: "UTC")!)
    }

    @Test func aHundredKilobytesRoundTripsByteForByte() throws {
        let (store, runs, cleanup) = try scratch()
        defer { cleanup() }
        let output = String(repeating: "line é ✓ 0123456789\n", count: 5_500)
        let url = try write(store, output)
        #expect(url.deletingLastPathComponent().standardizedFileURL == runs.standardizedFileURL)
        #expect(try Data(contentsOf: url) == Data(output.utf8))
        #expect(output.utf8.count > 100_000)
    }

    @Test func theFileNameIsTheShortcutNameAndTheTime() throws {
        let (store, _, cleanup) = try scratch()
        defer { cleanup() }
        let url = try write(store, name: "Publish draft")
        #expect(url.lastPathComponent == "Publish-draft-20231114-221320.txt")
    }

    @Test func unsafeNamesStayInsideTheRunsFolder() throws {
        let (store, runs, cleanup) = try scratch()
        defer { cleanup() }
        for name in ["../../etc/passwd", "a/b\\c", ".hidden", "  spaces  and  dots..", "Café Dossier", "日本語", "///", "", "a:b*c?d"] {
            let url = try write(store, name: name, at: date.addingTimeInterval(Double(name.count)))
            let file = url.lastPathComponent
            #expect(url.deletingLastPathComponent().standardizedFileURL == runs.standardizedFileURL, "\(name)")
            #expect(!file.hasPrefix("."), "\(name)")
            #expect(!file.dropLast(4).contains("/") && !file.contains("\\") && !file.contains(":"), "\(name)")
        }
        #expect(ShortcutOutputStore.sanitised("../../etc/passwd") == "etc-passwd")
        #expect(ShortcutOutputStore.sanitised("a  b..c") == "a-b-c")
        #expect(ShortcutOutputStore.sanitised("Café") == "Café")
        #expect(ShortcutOutputStore.sanitised("///") == "shortcut")
        #expect(ShortcutOutputStore.sanitised("") == "shortcut")
        #expect(ShortcutOutputStore.sanitised("keep_this-one") == "keep_this-one")
    }

    @Test func aVeryLongNameIsShortened() throws {
        let (store, _, cleanup) = try scratch()
        defer { cleanup() }
        let url = try write(store, name: String(repeating: "日", count: 300))
        #expect(url.lastPathComponent.utf8.count <= 255)
    }

    @Test func twoWritesInTheSameSecondKeepBothFiles() throws {
        let (store, runs, cleanup) = try scratch()
        defer { cleanup() }
        let first = try write(store, "one")
        let second = try write(store, "two")
        #expect(first != second)
        #expect(try String(contentsOf: first, encoding: .utf8) == "one")
        #expect(try String(contentsOf: second, encoding: .utf8) == "two")
        #expect(try FileManager.default.contentsOfDirectory(atPath: runs.path).count == 2)
    }

    @Test func emptyOutputWritesAnEmptyFile() throws {
        let (store, _, cleanup) = try scratch()
        defer { cleanup() }
        let url = try write(store, "")
        #expect(try Data(contentsOf: url).isEmpty)
    }

    @Test func prunesToTheNewestTwentyFiles() throws {
        let (store, runs, cleanup) = try scratch()
        defer { cleanup() }
        var written: [URL] = []
        for i in 0..<25 {
            let url = try write(store, "run \(i)", name: "Run \(i)", at: date.addingTimeInterval(Double(i)))
            try FileManager.default.setAttributes([.modificationDate: date.addingTimeInterval(Double(i))], ofItemAtPath: url.path)
            written.append(url)
        }
        let left = Set(try FileManager.default.contentsOfDirectory(atPath: runs.path))
        #expect(left.count == ShortcutOutputStore.keptFiles)
        #expect(left == Set(written.suffix(20).map(\.lastPathComponent)))
    }

    @Test func aFailedWriteThrowsATypedError() throws {
        let (store, _, cleanup) = try scratch()
        defer { cleanup() }
        let root = store.directory.deletingLastPathComponent()
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        try Data().write(to: store.directory)
        #expect(throws: ShortcutOutputError.self) { try write(store) }
    }

    @Test func theTailIsTheLastFiftyLinesAndTheFileHoldsAllThreeHundred() throws {
        let (store, _, cleanup) = try scratch()
        defer { cleanup() }
        let output = (1...300).map { "line \($0)" }.joined(separator: "\n") + "\n"
        let url = try write(store, output)
        let tail = ShortcutOutputStore.tail(of: output)
        #expect(tail.components(separatedBy: "\n") == (251...300).map { "line \($0)" })
        #expect(ShortcutOutputStore.tailLineCount == 50)
        #expect(try String(contentsOf: url, encoding: .utf8).components(separatedBy: "\n").count == 301)
    }

    @Test func tailEdgeCases() {
        #expect(ShortcutOutputStore.tail(of: "a\nb\nc", lines: 5) == "a\nb\nc")
        #expect(ShortcutOutputStore.tail(of: "a\nb\nc\n", lines: 2) == "b\nc")
        #expect(ShortcutOutputStore.tail(of: "a\r\nb\r\nc\r\n", lines: 2) == "b\nc")
        #expect(ShortcutOutputStore.tail(of: "a\n\n\nb", lines: 2) == "\nb")
        #expect(ShortcutOutputStore.tail(of: "", lines: 3) == "")
        #expect(ShortcutOutputStore.tail(of: "a\nb", lines: 0) == "")
    }

    @Test func theStandardStoreLivesInTheShortcutsFolderOfApplicationSupport() {
        let directory = ShortcutOutputStore.standard.directory
        #expect(directory.lastPathComponent == "shortcuts")
        #expect(directory.deletingLastPathComponent().lastPathComponent == "Application Support")
    }
}
