//
//  MCP.swift
//  MarkupEditorApp
//

import Foundation
import ArgumentParser
import MarkupEditorAppLib
import MarkupEditorMCP

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
            log: { try? FileHandle.standardError.write(contentsOf: Data(($0 + "\n").utf8)) },
            send: { try await client.send($0) },
            open: { try await MarkupEditorCLI.openInApp($0, appPath: $1) })
        let server = MCPServer(
            name: "markupeditor",
            version: BuildVariant.versionString,
            instructions: AssistantInstructions.text,
            tools: { await backend.tools() },
            knownNames: MCPControlBackend.knownToolNames,
            call: { await backend.call($0, $1) })
        await server.run(input: .standardInput, output: .standardOutput)
    }
}
