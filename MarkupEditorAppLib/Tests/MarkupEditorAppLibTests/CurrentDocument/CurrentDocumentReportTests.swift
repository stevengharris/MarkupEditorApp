//
//  CurrentDocumentReportTests.swift
//  MarkupEditorAppLibTests
//

import Testing
@testable import MarkupEditorAppLib

struct CurrentDocumentReportTests {

    @Test func aSavedDocumentPrintsOnlyItsPath() {
        let report = CurrentDocumentReport(for: .saved(path: "/a b/c.md"), requireSaved: false)
        #expect(report.output == "/a b/c.md")
        #expect(report.message == nil)
        #expect(report.exitCode == 0)
    }

    @Test func requiringSavedChangesNothingForASavedDocument() {
        let report = CurrentDocumentReport(for: .saved(path: "/a.md"), requireSaved: true)
        #expect(report.output == "/a.md")
        #expect(report.exitCode == 0)
    }

    @Test func aModifiedDocumentPrintsItsPathWithAWarning() {
        let report = CurrentDocumentReport(for: .modified(path: "/a.md"), requireSaved: false)
        #expect(report.output == "/a.md")
        #expect(report.exitCode == 0)
        #expect(report.message?.hasPrefix("warning:") == true)
        #expect(report.message?.contains("unsaved changes") == true)
    }

    @Test func requiringSavedRefusesAModifiedDocumentWithoutPrintingItsPath() {
        let report = CurrentDocumentReport(for: .modified(path: "/a.md"), requireSaved: true)
        #expect(report.output == nil)
        #expect(report.exitCode == 4)
        #expect(report.message?.hasPrefix("error:") == true)
        #expect(report.message?.contains("unsaved changes") == true)
    }

    @Test func anUntitledDocumentIsAnErrorWithItsOwnCode() {
        for requireSaved in [false, true] {
            let report = CurrentDocumentReport(for: .untitled, requireSaved: requireSaved)
            #expect(report.output == nil)
            #expect(report.exitCode == 3)
            #expect(report.message == "error: the open document has not been saved")
        }
    }

    @Test func anUnreadableStateFileSaysSoAndSharesTheNotRunningCode() {
        for requireSaved in [false, true] {
            let report = CurrentDocumentReport(for: .unreadableState, requireSaved: requireSaved)
            #expect(report.output == nil)
            #expect(report.exitCode == 2)
            #expect(report.message?.contains("could not be read") == true)
            #expect(report.message?.contains("not running") == false)
        }
    }

    @Test func aMissingAppIsAnErrorWithItsOwnCode() {
        for requireSaved in [false, true] {
            let report = CurrentDocumentReport(for: .notRunning, requireSaved: requireSaved)
            #expect(report.output == nil)
            #expect(report.exitCode == 2)
            #expect(report.message == "error: MarkupEditor is not running")
        }
    }

    @Test func aRefusedReadIsAnErrorThatPointsAtThePermission() {
        for requireSaved in [false, true] {
            let report = CurrentDocumentReport(for: .accessDenied, requireSaved: requireSaved)
            #expect(report.output == nil)
            #expect(report.exitCode == 5)
            #expect(report.message?.hasPrefix("error:") == true)
            #expect(report.message?.contains("Privacy & Security") == true)
        }
    }
}
