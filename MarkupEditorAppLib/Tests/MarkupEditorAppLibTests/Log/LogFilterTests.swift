//
//  LogFilterTests.swift
//  MarkupEditorAppLibTests
//

import Foundation
import Testing
@testable import MarkupEditorAppLib

@MainActor
struct LogFilterTests {

    private func sampleLog() -> EditLog {
        let log = EditLog()
        log.info("i")
        log.warning("w")
        log.error("e")
        log.warnings(["a", "b"], context: "group")
        return log
    }

    @Test func allShowsEveryEntry() {
        let log = sampleLog()
        #expect(LogFilter.all.visible(in: log.entries).count == 4)
    }

    @Test func infoShowsOnlyInformation() {
        let log = sampleLog()
        #expect(LogFilter.info.visible(in: log.entries).map(\.message) == ["i"])
    }

    @Test func issuesHideInformationAndKeepWarningsErrorsAndGroups() {
        let log = sampleLog()
        #expect(LogFilter.issues.visible(in: log.entries).map(\.message) == ["w", "e", "group: 2 warnings"])
    }

    @Test func warningsShowOnlyWarningsIncludingWarningGroups() {
        let log = sampleLog()
        #expect(LogFilter.warnings.visible(in: log.entries).map(\.message) == ["w", "group: 2 warnings"])
    }

    @Test func errorsShowOnlyErrors() {
        let log = sampleLog()
        #expect(LogFilter.errors.visible(in: log.entries).map(\.message) == ["e"])
    }

    @Test func theFiltersAreOrderedAllInfoIssuesWarningsErrors() {
        #expect(LogFilter.allCases.map(\.rawValue) == ["All", "Info", "Issues", "Warnings", "Errors"])
    }

    @Test func aSelectionIsLimitedToWhatTheFilterShowsAndKeepsLogOrder() {
        let log = sampleLog()
        let everything = Set(log.entries.map(\.id))
        #expect(LogFilter.errors.selected(everything, in: log.entries).map(\.message) == ["e"])
        let reversed = Set([log.entries[2].id, log.entries[0].id])
        #expect(LogFilter.all.selected(reversed, in: log.entries).map(\.message) == ["i", "e"])
        #expect(LogFilter.all.selected([], in: log.entries).isEmpty)
    }
}
