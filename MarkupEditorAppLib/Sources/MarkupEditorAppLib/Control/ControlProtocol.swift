//
//  ControlProtocol.swift
//  MarkupEditorAppLib
//

import Foundation

/// One request on the control channel: a tool name and its arguments, tagged with a caller-chosen id.
public struct ControlRequest: Codable, Sendable, Equatable {
    public var id: Int
    public var tool: String
    public var args: JSONValue

    public init(id: Int, tool: String, args: JSONValue = [:]) {
        self.id = id
        self.tool = tool
        self.args = args
    }
}

/// The reply to a `ControlRequest`, carrying either a result or an error message.
public struct ControlResponse: Codable, Sendable, Equatable {
    public var id: Int
    public var ok: Bool
    public var result: JSONValue?
    public var error: String?

    public static func success(id: Int, _ result: JSONValue) -> ControlResponse {
        ControlResponse(id: id, ok: true, result: result, error: nil)
    }

    public static func failure(id: Int, _ message: String) -> ControlResponse {
        ControlResponse(id: id, ok: false, result: nil, error: message)
    }
}

/// A failure a control tool reports back to the caller.
public struct ControlError: Error, LocalizedError, Equatable {
    public let message: String
    public init(_ message: String) { self.message = message }
    public var errorDescription: String? { message }
}
