//
//  ControlTool.swift
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

    /// Who may be offered a tool: every build, or Debug builds only.
    public enum Scope: Sendable, Equatable {
        case endUser
        case developer
    }

    public let name: String
    public let title: String
    public let description: String
    public let inputSchema: JSONValue
    public let annotations: Annotations
    public let scope: Scope
    /// What a client must be allowed to call it.
    public let access: ClientAccess

    public init(name: String, title: String, scope: Scope, access: ClientAccess, annotations: Annotations, description: String, inputSchema: JSONValue = Self.noArguments) {
        self.name = name
        self.title = title
        self.description = description
        self.annotations = annotations
        self.scope = scope
        self.access = access
        self.inputSchema = inputSchema
    }

    public static let noArguments: JSONValue = ["type": "object", "properties": [:]]

    public static func schema(_ properties: [String: (type: String, description: String)], required: [String]) -> JSONValue {
        .object([
            "type": "object",
            "properties": .object(properties.mapValues { ["type": .string($0.type), "description": .string($0.description)] }),
            "required": .array(required.map { .string($0) }),
        ])
    }
}
