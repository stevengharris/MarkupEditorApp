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
import MarkupEditorMCP

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
