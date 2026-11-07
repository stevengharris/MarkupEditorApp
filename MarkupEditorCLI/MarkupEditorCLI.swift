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
            markup export --format <html|pdf> [--images <link|embed>] [--output <path>] [--force] <file>
            markup mcp [--socket <path>]
            """,
        subcommands: [Open.self, Export.self, MCP.self],
        defaultSubcommand: Open.self
    )

    static let appBundleIdentifier = "com.stevengharris.MarkupEditorApp"

    static var versionString: String { BuildVariant.versionString }

    /// The app whose bundle contains this executable, when it is the embedded copy of the CLI
    /// (`<app>/Contents/Resources/bin/markup`), else the installed app. The executable path comes from
    /// `Bundle.main`, since `argv[0]` is a bare name when the CLI is found through `PATH`.
    static func appURL() -> URL? {
        let executable = (Bundle.main.executableURL ?? URL(fileURLWithPath: CommandLine.arguments[0]))
            .resolvingSymlinksInPath()
        let candidate = executable.deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent()
        if candidate.pathExtension == "app", Bundle(url: candidate)?.bundleIdentifier != nil {
            return candidate
        }
        return NSWorkspace.shared.urlForApplication(withBundleIdentifier: appBundleIdentifier)
    }

    /// Why `app` cannot be used with this CLI, or nil when its version and build match.
    static func versionMismatch(of app: URL) -> String? {
        let info = Bundle(url: app)?.infoDictionary
        let version = info?["CFBundleShortVersionString"] as? String ?? "unknown"
        let build = info?["CFBundleVersion"] as? String ?? "unknown"
        guard BuildVariant.version != "unknown", BuildVariant.build != "unknown" else { return nil }
        guard version != BuildVariant.version || build != BuildVariant.build else { return nil }
        return "\(app.path) is version \(version) (\(build)), but this command is \(BuildVariant.version) (\(BuildVariant.build)); use --app to override"
    }

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
