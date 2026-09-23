//
//  MarkupEditorCLI.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 8/26/24.
//  Copyright © 2024 Steven Harris. All rights reserved.
//

import AppKit
import Foundation
import ArgumentParser
import MarkupEditorAppLib

@main struct MarkupEditorCLI: AsyncParsableCommand {

    static var versionString: String { BuildVariant.versionString }

    static let configuration = CommandConfiguration(commandName: "markup")

    static let appBundleIdentifier = "com.stevengharris.MarkupEditorApp"

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
            print(Self.versionString)
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
        guard let appURL = NSWorkspace.shared.urlForApplication(withBundleIdentifier: Self.appBundleIdentifier) else {
            throw ValidationError("MarkupEditor is not installed")
        }
        let fileURL = URL(fileURLWithPath: filename)
        _ = try await NSWorkspace.shared.open([fileURL], withApplicationAt: appURL, configuration: NSWorkspace.OpenConfiguration())
    }
    
    func showUnrecognized() {
        if !other.isEmpty {
            print("\nWarning: Unrecognized arguments ignored")
            print(" \(other.joined(separator: " "))\n")
        }
    }
    
}

