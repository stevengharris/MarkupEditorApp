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

    static let configuration = CommandConfiguration(
        commandName: "markup",
        usage: """
            markup [--version] [<file>]
            markup mcp [--socket <path>]
            """,
        subcommands: [Open.self, MCP.self],
        defaultSubcommand: Open.self
    )

    static let appBundleIdentifier = "com.stevengharris.MarkupEditorApp"

    static var versionString: String { BuildVariant.versionString }

    /// Hand `fileURL` to MarkupEditor through Launch Services: the app at `appPath` when given, else
    /// the installed app.
    static func openInApp(_ fileURL: URL, appPath: String? = nil) async throws {
        guard let appURL = appPath.map({ URL(fileURLWithPath: $0) })
                ?? NSWorkspace.shared.urlForApplication(withBundleIdentifier: appBundleIdentifier) else {
            throw ValidationError("MarkupEditor is not installed")
        }
        _ = try await NSWorkspace.shared.open([fileURL], withApplicationAt: appURL, configuration: NSWorkspace.OpenConfiguration())
    }
}

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


/// `markup mcp`: a Model Context Protocol server on stdin and stdout that lets an MCP client read
/// and edit the document open in MarkupEditor. It works only while the app is running with
/// Assistants turned on and the user has allowed the client.
struct MCP: AsyncParsableCommand {

    static let configuration = CommandConfiguration(
        commandName: "mcp",
        abstract: "Run an MCP server on stdin/stdout that lets an assistant work with the document open in MarkupEditor.")

    @Option(name: .long, help: "Path of the app's control socket. Defaults to the app's container.")
    var socket: String?

    func run() async throws {
        // The first call from a program the user has not decided about waits for their answer.
        let client = ControlClient(path: socket ?? ControlClient.defaultPath(), timeout: 300)
        let backend = MCPControlBackend(
            client: ClientIdentity.ofParentProcess(),
            log: { FileHandle.standardError.write(Data(($0 + "\n").utf8)) },
            send: { try await client.send($0) },
            open: { try await MarkupEditorCLI.openInApp($0, appPath: $1) })
        let server = MCPServer(
            name: "markupeditor",
            version: BuildVariant.versionString,
            tools: { await backend.tools() },
            knownNames: MCPControlBackend.knownToolNames,
            call: { await backend.call($0, $1) })
        await server.run(input: .standardInput, output: .standardOutput)
    }
}
