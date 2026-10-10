//
//  Open.swift
//  MarkupEditorApp
//

import AppKit
import Foundation
import ArgumentParser

/// `markup [file]`: open a file in the installed app. This is the default subcommand, so
/// `markup file.md` works without naming it. A file called `mcp` needs `./mcp`.
struct Open: AsyncParsableCommand {

    static let configuration = CommandConfiguration(abstract: "Open a file in MarkupEditor.")

    //@Flag(name: [.short, .long], help: "Use named exporter.")
    //var exporter: String? = nil
    //
    //@Flag(name: [.short, .long], help: "Use named importer.")
    //var importer: String? = nil

    @Flag(name: [.short, .long], help: "Show version.")
    var version = false

    @Argument(help: "The file to open in MarkupEditor.")
    var filename: String?

    @Argument(parsing: .allUnrecognized, help: .hidden)
    var other: [String] = []

    mutating func run() async throws {

        // Let the user know if any arguments were unrecognized and therefore ignored
        showUnrecognized()

        // If version, then report and return
        if version {
            print(MarkupEditorCLI.versionString)
            return
        }

        if let filename {
            try await open(filename)
        }

    }

    /// Open `filename` in the installed MarkupEditor app, the same as double-clicking it in Finder.
    func open(_ filename: String) async throws {
        guard FileManager.default.fileExists(atPath: filename) else {
            throw ValidationError("No such file: \(filename)")
        }
        try await MarkupEditorCLI.openInApp(URL(fileURLWithPath: filename))
    }

    func showUnrecognized() {
        if !other.isEmpty {
            print("\nWarning: Unrecognized arguments ignored")
            print(" \(other.joined(separator: " "))\n")
        }
    }
    
}
