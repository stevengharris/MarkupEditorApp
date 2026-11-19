//
//  Current.swift
//  MarkupEditorApp
//

import Foundation
import ArgumentParser
import MarkupEditorAppLib

/// `markup current`: print the path of the saved file MarkupEditor has open. It reads a small file the
/// running app keeps up to date, so it needs neither Assistants nor a connection to the app.
struct Current: ParsableCommand {

    static let configuration = CommandConfiguration(
        commandName: "current",
        abstract: "Print the path of the saved document open in MarkupEditor.",
        discussion: """
            Standard output is only the path, so $(markup current) is safe in a script. Messages go to \
            standard error. Exit codes: 0 success; 2 MarkupEditor is not running; 3 the open document has \
            not been saved; 4 the document has unsaved changes and --saved was given; 5 macOS refused access to the app's data. Without --saved, a \
            document with unsaved changes still prints its path, with a warning.
            """)

    @Flag(name: .long, help: "Fail, with exit code 4, when the document has unsaved changes.")
    var saved = false

    func run() throws {
        let reading = CurrentDocumentFile(url: CurrentDocumentFile.defaultURL()).read()
        let resolution = CurrentDocumentResolver.resolve(reading, isRunning: { CurrentDocumentResolver.isMarkupEditorRunning(pid: $0) })
        let report = CurrentDocumentReport(for: resolution, requireSaved: saved)
        if let message = report.message { FileHandle.standardError.write(Data((message + "\n").utf8)) }
        if let output = report.output { print(output) }
        if report.exitCode != 0 { throw ExitCode(report.exitCode) }
    }
}
