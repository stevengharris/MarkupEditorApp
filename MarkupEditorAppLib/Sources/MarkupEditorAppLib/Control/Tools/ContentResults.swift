//
//  ContentResults.swift
//  MarkupEditorAppLib
//

import Foundation

/// One top-level block of the document, as the editor describes it.
public struct ContentBlock: Codable, Sendable, Equatable {
    public var index: Int
    public var kind: String
    public var hash: String
    public var markdown: String
    public var warnings: [String]

    public init(index: Int, kind: String, hash: String, markdown: String, warnings: [String] = []) {
        self.index = index
        self.kind = kind
        self.hash = hash
        self.markdown = markdown
        self.warnings = warnings
    }
}

/// What `get_document` returns: blocks in the editor view, the whole HTML when asked for, or the
/// shown text in the source view.
public struct DocumentContent: Codable, Sendable, Equatable {
    /// `"editor"` or `"source"`.
    public var view: String
    public var hasChanges: Bool
    public var url: String?
    public var documentType: String?
    public var blocks: [ContentBlock]?
    /// Index of the first block not returned; absent at the end of the document.
    public var next: Int?
    public var firstEditable: Int?
    public var selectionBlock: Int?
    public var html: String?
    public var source: String?

    public init(view: String, hasChanges: Bool, url: String? = nil, documentType: String? = nil, blocks: [ContentBlock]? = nil, next: Int? = nil, firstEditable: Int? = nil, selectionBlock: Int? = nil, html: String? = nil, source: String? = nil) {
        self.view = view
        self.hasChanges = hasChanges
        self.url = url
        self.documentType = documentType
        self.blocks = blocks
        self.next = next
        self.firstEditable = firstEditable
        self.selectionBlock = selectionBlock
        self.html = html
        self.source = source
    }
}

/// What `get_selection` returns.
public struct SelectionContent: Codable, Sendable, Equatable {
    public var text: String
    public var blockIndex: Int?
    public var block: ContentBlock?
    /// Informative editor state only: paragraph style, list, table, image, link, undo and redo availability.
    public var state: JSONValue

    public init(text: String, blockIndex: Int? = nil, block: ContentBlock? = nil, state: JSONValue = [:]) {
        self.text = text
        self.blockIndex = blockIndex
        self.block = block
        self.state = state
    }
}

/// What `select` returns.
public struct SelectionResult: Codable, Sendable, Equatable {
    public var found: Bool
    public var blockIndex: Int?
    /// Why the text could not be searched for; absent for a plain miss.
    public var reason: String?

    public init(found: Bool, blockIndex: Int? = nil, reason: String? = nil) {
        self.reason = reason
        self.found = found
        self.blockIndex = blockIndex
    }
}

/// What `replace_blocks` returns, whether or not the change was made.
public struct ReplaceResult: Codable, Sendable, Equatable {
    public struct Range: Codable, Sendable, Equatable {
        public var index: Int
        public var count: Int
        public init(index: Int, count: Int) {
            self.index = index
            self.count = count
        }
    }

    public var ok: Bool
    public var reason: String?
    /// The blocks now at `range` when changed; the current blocks there when refused as stale.
    public var range: Range?
    public var blocks: [ContentBlock]
    public var warnings: [String]

    public init(ok: Bool, reason: String? = nil, range: Range? = nil, blocks: [ContentBlock] = [], warnings: [String] = []) {
        self.ok = ok
        self.reason = reason
        self.range = range
        self.blocks = blocks
        self.warnings = warnings
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
        range = try container.decodeIfPresent(Range.self, forKey: .range)
        blocks = try container.decodeIfPresent([ContentBlock].self, forKey: .blocks) ?? []
        warnings = try container.decodeIfPresent([String].self, forKey: .warnings) ?? []
    }
}

/// What one edit in a `propose_edits` call came to.
public struct ProposeOutcome: Codable, Sendable, Equatable {
    /// Position of the edit in the call.
    public var index: Int
    /// `"proposed"` or `"refused"`.
    public var status: String
    public var id: String?
    public var block: Int?
    /// Why the edit was refused.
    public var reason: String?

    public init(index: Int, status: String, id: String? = nil, block: Int? = nil, reason: String? = nil) {
        self.index = index
        self.status = status
        self.id = id
        self.block = block
        self.reason = reason
    }
}

/// What `propose_edits` returns: one outcome per edit, or a refusal of the whole call (`ok` false, with a reason).
public struct ProposeResult: Codable, Sendable, Equatable {
    public var ok: Bool
    public var reason: String?
    public var results: [ProposeOutcome]

    public init(ok: Bool, reason: String? = nil, results: [ProposeOutcome] = []) {
        self.ok = ok
        self.reason = reason
        self.results = results
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
        results = try container.decodeIfPresent([ProposeOutcome].self, forKey: .results) ?? []
    }
}

/// One suggestion as `list_suggestions` reports it.
public struct Suggestion: Codable, Sendable, Equatable {
    public var id: String
    /// `"pending"`, `"accepted"`, `"rejected"` or `"stale"`.
    public var status: String
    /// The block it was in; for a resolved suggestion, the block when it was resolved, which later edits can leave out of date.
    public var block: Int
    public var find: String
    public var replace: String
    public var note: String?
    /// For a stale suggestion, `"edited"` or `"document-replaced"`.
    public var reason: String?

    public init(id: String, status: String, block: Int, find: String, replace: String, note: String? = nil, reason: String? = nil) {
        self.id = id
        self.status = status
        self.block = block
        self.find = find
        self.replace = replace
        self.note = note
        self.reason = reason
    }
}

/// What `list_suggestions` returns.
public struct SuggestionList: Codable, Sendable, Equatable {
    public var ok: Bool
    public var reason: String?
    public var suggestions: [Suggestion]

    public init(ok: Bool, reason: String? = nil, suggestions: [Suggestion] = []) {
        self.ok = ok
        self.reason = reason
        self.suggestions = suggestions
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        ok = try container.decode(Bool.self, forKey: .ok)
        reason = try container.decodeIfPresent(String.self, forKey: .reason)
        suggestions = try container.decodeIfPresent([Suggestion].self, forKey: .suggestions) ?? []
    }
}

extension Encodable {
    /// This value as a `JSONValue`, for a tool reply.
    func jsonValue() throws -> JSONValue {
        try JSONDecoder().decode(JSONValue.self, from: JSONEncoder().encode(self))
    }
}
