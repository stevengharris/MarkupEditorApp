//
//  EditLogTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Observation
import Testing
@testable import MarkupEditorAppLib

/// Tests on a fresh instance, which the test drives through the instance methods.
@MainActor
struct EditLogTests {

    private func log(at start: Date = Date(timeIntervalSince1970: 1_700_000_000)) -> (EditLog, Clock) {
        let clock = Clock(start)
        let log = EditLog()
        log.clock = { clock.now() }
        return (log, clock)
    }

    final class Clock: @unchecked Sendable {
        private var current: Date
        init(_ start: Date) { current = start }
        func now() -> Date { current }
        func advance(_ seconds: TimeInterval) { current = current.addingTimeInterval(seconds) }
    }

    // MARK: Levels, time and plain text

    @Test func recordsLevelCategoryAndDate() {
        let (log, _) = log()
        log.info("one")
        log.warning("two", category: "Template")
        log.error("three")
        #expect(log.entries.map(\.level) == [.info, .warning, .error])
        #expect(log.entries.map(\.category) == [nil, "Template", nil])
        #expect(log.entries.map(\.count) == [1, 1, 1])
        #expect(log.entries.allSatisfy { $0.date == Date(timeIntervalSince1970: 1_700_000_000) })
        #expect(log.entries.allSatisfy { $0.details.isEmpty && $0.detailCount == 0 })
    }

    @Test func plainTextHasHeaderAndOneLinePerEntry() throws {
        let (log, _) = log()
        log.info("started")
        log.warning("careful", category: "Template")
        let lines = log.plainText(header: "MarkupEditor 1.0 (Eval)\nmacOS 26.3").components(separatedBy: "\n")
        #expect(lines[0] == "MarkupEditor 1.0 (Eval)")
        #expect(lines[1] == "macOS 26.3")
        #expect(lines[2] == "")
        let pattern = try Regex(#"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \[info\] started$"#)
        #expect(lines[3].wholeMatch(of: pattern) != nil)
        let second = try Regex(#"^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d \[warning\] Template: careful$"#)
        #expect(lines[4].wholeMatch(of: second) != nil)
        #expect(lines.count == 5)
    }

    @Test func plainTextIndentsContinuationLinesOfAMultiLineMessage() {
        let (log, _) = log()
        log.error("first line\nsecond line\nthird line")
        let lines = log.plainText(header: "").components(separatedBy: "\n")
        #expect(lines.count == 3)
        #expect(lines[0].hasSuffix("[error] first line"))
        #expect(lines[1] == "    second line")
        #expect(lines[2] == "    third line")
    }

    @Test func plainTextOfSelectedEntriesKeepsTheirOrder() {
        let (log, _) = log()
        log.info("a")
        log.info("b")
        log.info("c")
        let text = log.plainText(entries: [log.entries[2], log.entries[0]], header: "")
        let lines = text.components(separatedBy: "\n")
        #expect(lines.count == 2)
        #expect(lines[0].hasSuffix("c"))
        #expect(lines[1].hasSuffix("a"))
    }

    // MARK: Groups

    @Test func groupOfFourteenWarningsIsOneEntryWithDetails() {
        let (log, _) = log()
        log.warnings((1...14).map { "problem \($0)" }, context: "Opening notes.md", category: "Document")
        #expect(log.entries.count == 1)
        let entry = log.entries[0]
        #expect(entry.message == "Opening notes.md: 14 warnings")
        #expect(entry.level == .warning)
        #expect(entry.detailCount == 14)
        #expect(entry.details.count == 14)
        #expect(entry.details.first?.text == "problem 1")
        #expect(entry.details.allSatisfy { $0.level == .warning && $0.count == 1 })
    }

    @Test func aBatchOfOneIsAnOrdinaryEntryAndAnEmptyBatchRecordsNothing() {
        let (log, _) = log()
        log.warnings([], context: "Opening empty.md")
        #expect(log.entries.isEmpty)
        #expect(log.unreadLevel == nil)
        log.warnings(["only one"], context: "Opening one.md")
        #expect(log.entries.count == 1)
        #expect(log.entries[0].details.isEmpty)
        #expect(log.entries[0].detailCount == 0)
        #expect(log.entries[0].message == "Opening one.md: only one")
        #expect(log.entries[0].level == .warning)
    }

    @Test func theSameMessageFourTimesInABatchFoldsToOneDetail() {
        let (log, _) = log()
        log.warnings(Array(repeating: "same", count: 4), context: "Opening x.md")
        let entry = log.entries[0]
        #expect(entry.message == "Opening x.md: 4 warnings")
        #expect(entry.detailCount == 4)
        #expect(entry.details.count == 1)
        #expect(entry.details[0].count == 4)
    }

    @Test func detailsAreCappedAndTheSummaryGivesTheTrueCount() {
        let (log, _) = log()
        log.warnings((1...1_203).map { "problem \($0)" }, context: "Opening big.md")
        let entry = log.entries[0]
        #expect(entry.details.count == 200)
        #expect(entry.detailCount == 1_203)
        #expect(entry.message == "Opening big.md: 1,203 warnings (first 200 shown)")
        #expect(entry.details[0].text == "problem 1")
        #expect(entry.details[199].text == "problem 200")
    }

    @Test func aMixedBatchTakesTheHighestLevelAndSaysMessages() {
        let (log, _) = log()
        log.group([(.warning, "w1"), (.warning, "w2"), (.error, "e1")], context: "Loading")
        let entry = log.entries[0]
        #expect(entry.level == .error)
        #expect(entry.message == "Loading: 3 messages")
        #expect(log.unreadLevel == .error)
        #expect(entry.details.map(\.level) == [.warning, .warning, .error])
    }

    @Test func aBatchOfErrorsSaysErrors() {
        let (log, _) = log()
        log.group([(.error, "e1"), (.error, "e2")], context: "Loading")
        #expect(log.entries[0].message == "Loading: 2 errors")
    }

    // MARK: Folding

    @Test func theSameEntryThreeTimesInARowFoldsWithTheLatestDate() {
        let (log, clock) = log()
        log.warning("again", category: "Update")
        clock.advance(10)
        log.warning("again", category: "Update")
        clock.advance(10)
        log.warning("again", category: "Update")
        #expect(log.entries.count == 1)
        #expect(log.entries[0].count == 3)
        #expect(log.entries[0].date == Date(timeIntervalSince1970: 1_700_000_020))
    }

    @Test func foldingMatchesOnlyTheImmediatelyPrecedingEntry() {
        let (log, _) = log()
        log.error("Error 1")
        log.error("Error 2")
        log.error("Error 1")
        #expect(log.entries.map(\.message) == ["Error 1", "Error 2", "Error 1"])
        #expect(log.entries.map(\.count) == [1, 1, 1])
    }

    @Test func entriesDifferingInLevelOrCategoryDoNotFold() {
        let (log, _) = log()
        log.warning("x")
        log.error("x")
        log.error("x", category: "Template")
        #expect(log.entries.count == 3)
    }

    @Test func identicalGroupsFold() {
        let (log, _) = log()
        log.warnings(["a", "b"], context: "Opening")
        log.warnings(["a", "b"], context: "Opening")
        log.warnings(["a", "c"], context: "Opening")
        #expect(log.entries.count == 2)
        #expect(log.entries[0].count == 2)
    }

    // MARK: Unread level

    @Test func informationNeverRaisesTheIndicatorButWarningsAndErrorsDo() {
        let (log, _) = log()
        log.info("fine")
        #expect(log.unreadLevel == nil)
        log.warning("hmm")
        #expect(log.unreadLevel == .warning)
        log.error("bad")
        #expect(log.unreadLevel == .error)
        log.warning("hmm again")
        #expect(log.unreadLevel == .error)
        log.markRead()
        #expect(log.unreadLevel == nil)
        #expect(log.entries.count == 4)
    }

    @Test func aFoldedErrorLightsTheIndicatorAgainAfterItWasRead() {
        let (log, _) = log()
        log.error("boom")
        log.markRead()
        log.error("boom")
        #expect(log.entries.count == 1)
        #expect(log.entries[0].count == 2)
        #expect(log.unreadLevel == .error)
    }

    @Test func theSameErrorAfterOtherEntriesIsANewRowAndLightsTheIndicator() {
        let (log, _) = log()
        log.error("boom")
        log.markRead()
        log.info("something else")
        log.error("boom")
        #expect(log.entries.count == 3)
        #expect(log.unreadLevel == .error)
    }

    // MARK: Record once

    @Test func aOnceRepeatUpdatesTheEntryAndDoesNotLightTheIndicator() {
        let (log, clock) = log()
        log.warning("template broken", category: "Template", once: "template:notes")
        log.markRead()
        clock.advance(60)
        log.warning("template broken", category: "Template", once: "template:notes")
        #expect(log.entries.count == 1)
        #expect(log.entries[0].count == 2)
        #expect(log.entries[0].date == Date(timeIntervalSince1970: 1_700_000_060))
        #expect(log.unreadLevel == nil)
    }

    @Test func aOnceRepeatUpdatesANonAdjacentEntryWithoutAddingARow() {
        let (log, _) = log()
        log.warning("keyed", once: "k")
        log.info("between")
        log.warning("keyed", once: "k")
        #expect(log.entries.map(\.message) == ["keyed", "between"])
        #expect(log.entries[0].count == 2)
    }

    @Test func aFirstKeyedCallIsANewRowThatDoesNotFoldIntoItsNeighbour() {
        let (log, _) = log()
        log.warning("same text")
        log.warning("same text", once: "k")
        #expect(log.entries.count == 2)
        #expect(log.entries.map(\.count) == [1, 1])
    }

    @Test func differentKeysAreSeparateEntries() {
        let (log, _) = log()
        log.warning("same text", once: "a")
        log.warning("same text", once: "b")
        #expect(log.entries.count == 2)
    }

    @Test func clearReleasesTheOnceKeys() {
        let (log, _) = log()
        log.warning("w", once: "k")
        log.clear()
        #expect(log.keyCount == 0)
        log.warning("w", once: "k")
        #expect(log.entries.count == 1)
        #expect(log.entries[0].count == 1)
        #expect(log.unreadLevel == .warning)
    }

    @Test func droppingAKeyedEntryOffTheCapReleasesItsKey() {
        let (log, _) = log()
        log.warning("keyed", once: "k")
        for index in 0..<EditLog.entryCap { log.info("filler \(index)") }
        #expect(!log.entries.contains { $0.message == "keyed" })
        #expect(log.keyCount == 0)
        log.warning("keyed", once: "k")
        #expect(log.entries.last?.message == "keyed")
        #expect(log.entries.last?.count == 1)
    }

    @Test func aOnceGroupRepeatDoesNotAddARow() {
        let (log, _) = log()
        log.warnings(["a", "b"], context: "Scan", once: "scan")
        log.markRead()
        log.warnings(["a", "b"], context: "Scan", once: "scan")
        #expect(log.entries.count == 1)
        #expect(log.entries[0].count == 2)
        #expect(log.unreadLevel == nil)
    }

    // MARK: Cap and clear

    @Test func theCapDropsTheOldestEntries() {
        let (log, _) = log()
        for index in 0..<(EditLog.entryCap + 5) { log.info("entry \(index)") }
        #expect(log.entries.count == EditLog.entryCap)
        #expect(log.entries.first?.message == "entry 5")
        #expect(log.entries.last?.message == "entry \(EditLog.entryCap + 4)")
    }

    @Test func clearEmptiesTheEntriesAndTheUnreadLevel() {
        let (log, _) = log()
        log.error("bad")
        log.clear()
        #expect(log.entries.isEmpty)
        #expect(log.unreadLevel == nil)
    }

    // MARK: Plain text of folded entries and groups

    @Test func plainTextShowsCountsAndIndentedDetails() {
        let (log, clock) = log()
        log.warning("folded")
        clock.advance(5)
        log.warning("folded")
        clock.advance(5)
        log.warning("folded")
        log.warnings(["a", "a", "a", "a", "b"], context: "Opening", category: "Document")
        let lines = log.plainText(header: "").components(separatedBy: "\n")
        #expect(lines.count == 4)
        #expect(lines[0].hasSuffix("[warning] folded (×3)"))
        #expect(lines[0].hasPrefix("2023-11-1"))
        #expect(lines[1].hasSuffix("[warning] Document: Opening: 5 warnings"))
        #expect(lines[2] == "    [warning] a (×4)")
        #expect(lines[3] == "    [warning] b")
    }

    @Test func plainTextShowsTheLatestDateOfAFoldedEntry() {
        let (log, clock) = log()
        log.info("x")
        clock.advance(3_600)
        log.info("x")
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"
        let later = formatter.string(from: Date(timeIntervalSince1970: 1_700_003_600))
        #expect(log.plainText(header: "").hasPrefix(later))
    }
}

/// Tests that reach `EditLog.shared` through the static `record`. Library code under test in other suites
/// also records to it, so each test tags its messages and looks only at its own entries.
@MainActor
@Suite(.serialized)
struct EditLogSharedTests {

    /// Waits for work hopped to the main actor, up to two seconds.
    private func waitUntil(_ condition: () -> Bool) async {
        for _ in 0..<200 where !condition() {
            try? await Task.sleep(for: .milliseconds(10))
        }
    }

    private func blockTheMainActor() {
        Thread.sleep(forTimeInterval: 0.2)
    }

    private func entries(tagged tag: String) -> [LogEntry] {
        EditLog.shared.entries.filter { $0.message.hasPrefix(tag) }
    }

    @Test func recordOnTheMainThreadKeepsCallOrder() {
        let log = EditLog.shared
        let tag = UUID().uuidString
        for index in 0..<10 {
            if index.isMultiple(of: 2) {
                EditLog.record(.info, "\(tag) \(index)")
            } else {
                log.info("\(tag) \(index)")
            }
        }
        #expect(entries(tagged: tag).map(\.message) == (0..<10).map { "\(tag) \($0)" })
    }

    @Test func recordFromABackgroundThreadAppendsAndNotifiesObservers() async {
        let log = EditLog.shared
        let tag = UUID().uuidString
        let fired = FiredFlag()
        withObservationTracking {
            _ = log.entries
        } onChange: {
            fired.set()
        }
        await withCheckedContinuation { continuation in
            DispatchQueue.global().async {
                EditLog.record(.warning, "\(tag) from background", category: "Test")
                continuation.resume()
            }
        }
        await waitUntil { entries(tagged: tag).count == 1 }
        let mine = entries(tagged: tag)
        #expect(mine.map(\.message) == ["\(tag) from background"])
        #expect(mine.first?.category == "Test")
        #expect(mine.first?.level == .warning)
        #expect(fired.isSet)
    }

    @Test func recordTakesTheDateAtTheCall() async {
        let tag = UUID().uuidString
        let before = Date()
        let after = DateBox()
        DispatchQueue.global().async {
            EditLog.record(.info, "\(tag) dated")
            after.set(Date())
        }
        // Holds the main actor so the hop cannot run until well after the call returned.
        blockTheMainActor()
        await waitUntil { entries(tagged: tag).count == 1 }
        let date = entries(tagged: tag).first?.date
        #expect(date.map { $0 >= before && $0 <= after.value } == true)
    }

    @Test func recordWithAOnceKeyFoldsIntoOneEntry() {
        let tag = UUID().uuidString
        EditLog.record(.warning, "\(tag) standing", once: tag)
        EditLog.record(.warning, "\(tag) standing", once: tag)
        let mine = entries(tagged: tag)
        #expect(mine.count == 1)
        #expect(mine.first?.count == 2)
    }

    final class DateBox: @unchecked Sendable {
        private let lock = NSLock()
        private var date = Date.distantFuture
        func set(_ newValue: Date) { lock.lock(); date = newValue; lock.unlock() }
        var value: Date { lock.lock(); defer { lock.unlock() }; return date }
    }

    final class FiredFlag: @unchecked Sendable {
        private let lock = NSLock()
        private var value = false
        func set() { lock.lock(); value = true; lock.unlock() }
        var isSet: Bool { lock.lock(); defer { lock.unlock() }; return value }
    }
}
