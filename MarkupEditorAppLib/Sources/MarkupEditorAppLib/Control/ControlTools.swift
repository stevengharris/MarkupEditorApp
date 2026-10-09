//
//  ControlTools.swift
//  MarkupEditorAppLib
//

import Foundation

/// A tool the control channel offers, in the shape MCP lists it.
public struct ControlTool: Sendable, Equatable {

    /// Behavior hints MCP clients use to decide how much confirmation a call needs.
    public struct Annotations: Sendable, Equatable {
        public var readOnly: Bool
        /// Meaningful only when not read-only: the tool may overwrite or discard existing data.
        public var destructive: Bool

        public static let readOnly = Annotations(readOnly: true, destructive: false)
        public static let additive = Annotations(readOnly: false, destructive: false)
        public static let destructive = Annotations(readOnly: false, destructive: true)

        var json: JSONValue {
            var hints: [String: JSONValue] = ["readOnlyHint": .bool(readOnly), "openWorldHint": false]
            if !readOnly { hints["destructiveHint"] = .bool(destructive) }
            return .object(hints)
        }
    }

    public let name: String
    public let title: String
    public let description: String
    public let inputSchema: JSONValue
    public let annotations: Annotations

    public init(name: String, title: String, annotations: Annotations, description: String, inputSchema: JSONValue = Self.noArguments) {
        self.name = name
        self.title = title
        self.description = description
        self.annotations = annotations
        self.inputSchema = inputSchema
    }

    public static let noArguments: JSONValue = ["type": "object", "properties": [:]]

    static func schema(_ properties: [String: (type: String, description: String)], required: [String]) -> JSONValue {
        .object([
            "type": "object",
            "properties": .object(properties.mapValues { ["type": .string($0.type), "description": .string($0.description)] }),
            "required": .array(required.map { .string($0) }),
        ])
    }
}

/// Tools the running app answers. `open_document` is not here because the MCP server performs it
/// from outside the sandbox.
public enum ControlTools {

    public static let appState = "app_state"
    public static let saveDocument = "save_document"
    public static let runMenuCommand = "run_menu_command"
    public static let evalJS = "eval_js"
    public static let getMarkdown = "get_markdown"
    public static let getHTML = "get_html"
    public static let typeText = "type_text"
    public static let screenshotEditor = "screenshot_editor"

    /// Answered by the app, not offered to clients: the names of the tools this app supports.
    public static let listTools = "list_tools"

    public static let all: [ControlTool] = [
        ControlTool(
            name: appState, title: "App state", annotations: .readOnly,
            description: "Report the open document's URL, whether it has unsaved changes, document type, source view state, the app's bundle path, and its windows."),
        ControlTool(
            name: saveDocument, title: "Save document", annotations: .destructive,
            description: "Save the open document to its file, the same as File > Save. Overwrites the file."),
        ControlTool(
            name: runMenuCommand, title: "Run menu command", annotations: .destructive,
            description: "Run a menu command by name: new, open, save, saveAs, toggleSource, showSettings, closeWindow (clicks the close button). 'open' and 'saveAs' show a file panel the user must answer.",
            inputSchema: ControlTool.schema(["name": ("string", "The command name.")], required: ["name"])),
        ControlTool(
            name: evalJS, title: "Evaluate JavaScript", annotations: .destructive,
            description: "Evaluate JavaScript in the editor web view and return the result as JSON. The MU namespace is the editor API, for example MU.getHTML().",
            inputSchema: ControlTool.schema(["script": ("string", "A JavaScript expression or statements.")], required: ["script"])),
        ControlTool(
            name: getMarkdown, title: "Get Markdown", annotations: .readOnly,
            description: "Return the live document converted to Markdown, including unsaved edits."),
        ControlTool(
            name: getHTML, title: "Get HTML", annotations: .readOnly,
            description: "Return the live document as HTML, including unsaved edits."),
        ControlTool(
            name: typeText, title: "Insert text", annotations: .additive,
            description: "Insert text at the current selection in the editor, the same as pasting it.",
            inputSchema: ControlTool.schema(["text": ("string", "The text to insert.")], required: ["text"])),
        ControlTool(
            name: screenshotEditor, title: "Screenshot editor", annotations: .readOnly,
            description: "Capture the editor web view as a PNG image."),
    ]

    public static func named(_ name: String) -> ControlTool? {
        all.first { $0.name == name }
    }
}
