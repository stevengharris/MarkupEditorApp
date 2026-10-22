//
//  ContentCommand.swift
//  MarkupEditorAppLib
//

import Foundation

/// How `get_document` returns the document.
public enum ContentFormat: String, Sendable, Equatable {
    case markdown
    case html
}

/// What `select` is asked to select.
public enum SelectionTarget: Sendable, Equatable {
    /// A caret at the start of the block with this index.
    case block(Int)
    /// The `occurrence`th match (1 is the first, counted from the document start) of this rendered text.
    case text(String, occurrence: Int)
}

/// A content tool's validated arguments. Built from a request before the app sees it, so nothing
/// malformed reaches the facade and nothing is clamped or defaulted to a different meaning.
public enum ContentCommand: Sendable, Equatable {
    case getDocument(format: ContentFormat, from: Int?, limit: Int?)
    case getSelection
    case select(SelectionTarget)
    case replaceBlocks(index: Int, count: Int, markdown: String, expected: [String], allowLoss: Bool)
    case undo
    case redo
    case saveDocument

    /// The command for `tool` with `args`, `nil` when `tool` is not a content tool.
    /// - Throws: `ControlError` naming the argument that is missing or invalid.
    public init?(tool: String, args: JSONValue) throws {
        let reader = ArgumentReader(tool: tool, args: args)
        switch tool {
        case ControlTools.getDocument:
            let format = try reader.optionalString("format")
            guard let parsed = format.map({ ContentFormat(rawValue: $0) }) ?? .some(.markdown) else {
                throw ControlError("get_document: format must be \"markdown\" or \"html\"")
            }
            self = .getDocument(
                format: parsed,
                from: try reader.optionalInteger("from", minimum: 0),
                limit: try reader.optionalInteger("limit", minimum: 1))
        case ControlTools.getSelection:
            self = .getSelection
        case ControlTools.select:
            let block = try reader.optionalInteger("block", minimum: 0)
            let text = try reader.optionalString("text")
            let occurrence = try reader.optionalInteger("occurrence", minimum: 1)
            switch (block, text) {
            case (nil, nil):
                throw ControlError("select: give either 'block' (an index) or 'text' (text to find)")
            case (.some, .some):
                throw ControlError("select: give either 'block' or 'text', not both")
            case (.some(let index), nil):
                if occurrence != nil { throw ControlError("select: 'occurrence' goes with 'text', not 'block'") }
                self = .select(.block(index))
            case (nil, .some(let found)):
                if found.isEmpty { throw ControlError("select: 'text' must not be empty") }
                self = .select(.text(found, occurrence: occurrence ?? 1))
            }
        case ControlTools.replaceBlocks:
            self = .replaceBlocks(
                index: try reader.integer("index", minimum: 0),
                count: try reader.integer("count", minimum: 0),
                markdown: try reader.string("markdown"),
                expected: try reader.stringArray("expected"),
                allowLoss: try reader.optionalBool("allowLoss") ?? false)
        case ControlTools.undo:
            self = .undo
        case ControlTools.redo:
            self = .redo
        case ControlTools.saveDocument:
            self = .saveDocument
        default:
            return nil
        }
    }
}

/// Reads a tool's arguments with their types checked. A wrong type, a fractional or out-of-range
/// integer and a missing required value are each refused with a reason naming the argument.
struct ArgumentReader {
    let tool: String
    let args: JSONValue

    private func value(_ name: String) -> JSONValue? {
        guard let value = args[name], value != .null else { return nil }
        return value
    }

    private func fail(_ name: String, _ problem: String) -> ControlError {
        ControlError("\(tool): '\(name)' \(problem)")
    }

    func string(_ name: String) throws -> String {
        guard let value = value(name) else { throw fail(name, "is required") }
        guard let string = value.stringValue else { throw fail(name, "must be a string") }
        return string
    }

    func optionalString(_ name: String) throws -> String? {
        guard value(name) != nil else { return nil }
        return try string(name)
    }

    func integer(_ name: String, minimum: Int) throws -> Int {
        guard let value = value(name) else { throw fail(name, "is required") }
        guard let integer = value.intValue else { throw fail(name, "must be an integer") }
        guard integer >= minimum else { throw fail(name, "must be \(minimum) or more") }
        return integer
    }

    func optionalInteger(_ name: String, minimum: Int) throws -> Int? {
        guard value(name) != nil else { return nil }
        return try integer(name, minimum: minimum)
    }

    func optionalBool(_ name: String) throws -> Bool? {
        guard let value = value(name) else { return nil }
        guard case .bool(let flag) = value else { throw fail(name, "must be true or false") }
        return flag
    }

    func stringArray(_ name: String) throws -> [String] {
        guard let value = value(name) else { throw fail(name, "is required") }
        guard case .array(let items) = value else { throw fail(name, "must be an array of strings") }
        return try items.map { item in
            guard let string = item.stringValue else { throw fail(name, "must be an array of strings") }
            return string
        }
    }
}
