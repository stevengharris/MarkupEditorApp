//
//  YAMLMetadata.swift
//  MarkupEditorApp
//
//  Created by Steven Harris on 5/29/26.
//

import Foundation

// YAML parser and serializer for flat frontmatter.
// Handles scalar strings, booleans, numbers, null, flow sequences, and block sequences.
// Multi-line scalars, anchors, aliases, and nested mappings emit warnings instead of failing.

struct YAMLMetadata {

    // MARK: - Parser

    /// Parse a raw YAML string (contents between `---` delimiters) into an ordered key-value array.
    static func parse(_ yaml: String, warnings: inout [String]) -> [MetadataTuple] {
        var result: [MetadataTuple] = []
        let lines = yaml.components(separatedBy: "\n")
        var i = 0
        while i < lines.count {
            let line = lines[i]
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            // Skip blank lines and comments
            if trimmed.isEmpty || trimmed.hasPrefix("#") {
                i += 1
                continue
            }
            // Multi-line scalar indicators — warn and skip
            if trimmed.hasSuffix(": |") || trimmed.hasSuffix(": >") {
                warnings.append("Unsupported YAML construct at line \(i + 1): \(trimmed)")
                i += 1
                continue
            }
            // Key: value line
            guard let colonRange = firstUnquotedColon(in: trimmed) else {
                warnings.append("Skipping unparseable YAML line \(i + 1): \(trimmed)")
                i += 1
                continue
            }
            let key = String(trimmed[trimmed.startIndex..<colonRange]).trimmingCharacters(in: .whitespaces)
            let rawValue = String(trimmed[trimmed.index(after: colonRange)...]).trimmingCharacters(in: .whitespaces)
            if rawValue.isEmpty {
                // Might be block sequence: look ahead for `- item` lines
                var items: [String] = []
                var itemsQuoted: [QuoteStyle?] = []
                var j = i + 1
                while j < lines.count {
                    let next = lines[j].trimmingCharacters(in: .whitespaces)
                    if next.hasPrefix("- ") {
                        let raw = String(next.dropFirst(2)).trimmingCharacters(in: .whitespaces)
                        items.append(parseScalar(raw))
                        itemsQuoted.append(quoteStyle(raw))
                        j += 1
                    } else if next.isEmpty {
                        j += 1
                    } else {
                        break
                    }
                }
                if !items.isEmpty {
                    result.append(MetadataTuple(key: key, value: .array(items), quoted: itemsQuoted))
                    i = j
                } else {
                    result.append(MetadataTuple(key: key, value: .scalar("")))
                    i += 1
                }
            } else if rawValue.hasPrefix("[") {
                let items = parseFlowSequence(rawValue)
                result.append(MetadataTuple(key: key, value: .array(items.map(\.text)), quoted: items.map(\.quoted)))
                i += 1
            } else {
                result.append(MetadataTuple(key: key, value: .scalar(parseScalar(rawValue)), quoted: [quoteStyle(rawValue)]))
                i += 1
            }
        }
        return result
    }

    // MARK: - Serializer

    /// Serialize an ordered metadata array to a YAML string (without `---` delimiters).
    static func serialize(_ metadata: [MetadataTuple]) -> String {
        var lines: [String] = []
        for entry in metadata {
            switch entry.value {
            case .scalar(let s):
                lines.append("\(entry.key): \(written(s, quotedAs: entry.quoted.first ?? nil, inSequence: false))")
            case .array(let elements):
                let written = elements.enumerated().map { index, element in
                    written(element, quotedAs: entry.quoted.indices.contains(index) ? entry.quoted[index] : nil, inSequence: true)
                }.joined(separator: ", ")
                lines.append("\(entry.key): [\(written)]")
            }
        }
        return lines.joined(separator: "\n") + (lines.isEmpty ? "" : "\n")
    }

    // MARK: - Private helpers

    // Returns the index of the first `:` that is not inside a quoted string.
    private static func firstUnquotedColon(in s: String) -> String.Index? {
        var inSingle = false
        var inDouble = false
        var idx = s.startIndex
        while idx < s.endIndex {
            let ch = s[idx]
            if ch == "'" && !inDouble { inSingle.toggle() }
            else if ch == "\"" && !inSingle { inDouble.toggle() }
            else if ch == ":" && !inSingle && !inDouble { return idx }
            idx = s.index(after: idx)
        }
        return nil
    }

    // Parse a flow sequence string like `[a, "b", c]` into an array of scalar strings. A quote
    // only opens at the start of an item, so an apostrophe inside a bare word (`don't`) is
    // literal, and a backslash inside a double-quoted item escapes the next character.
    private static func parseFlowSequence(_ s: String) -> [(text: String, quoted: QuoteStyle?)] {
        var inner = s.trimmingCharacters(in: .whitespaces)
        if inner.hasPrefix("[") { inner = String(inner.dropFirst()) }
        if inner.hasSuffix("]") { inner = String(inner.dropLast()) }
        var items: [(text: String, quoted: QuoteStyle?)] = []
        var current = ""
        var quote: Character?
        var escaped = false
        for ch in inner {
            if let open = quote {
                current.append(ch)
                if escaped {
                    escaped = false
                } else if open == "\"" && ch == "\\" {
                    escaped = true
                } else if ch == open {
                    quote = nil
                }
            } else if (ch == "\"" || ch == "'") && current.allSatisfy(\.isWhitespace) {
                quote = ch
                current.append(ch)
            } else if ch == "," {
                let item = current.trimmingCharacters(in: .whitespaces)
                items.append((parseScalar(item), quoteStyle(item)))
                current = ""
            } else {
                current.append(ch)
            }
        }
        let last = current.trimmingCharacters(in: .whitespaces)
        if !last.isEmpty { items.append((parseScalar(last), quoteStyle(last))) }
        return items
    }

    // The quotes a scalar token is wrapped in, as parseScalar strips them, or nil when it has none.
    private static func quoteStyle(_ s: String) -> QuoteStyle? {
        guard s.count >= 2 else { return nil }
        if s.hasPrefix("\"") && s.hasSuffix("\"") { return .double }
        if s.hasPrefix("'") && s.hasSuffix("'") { return .single }
        return nil
    }

    // Strip quotes and handle escape sequences from a scalar token.
    private static func parseScalar(_ s: String) -> String {
        if s.hasPrefix("\"") && s.hasSuffix("\"") && s.count >= 2 {
            let inner = String(s.dropFirst().dropLast())
            return inner.replacingOccurrences(of: "\\\"", with: "\"")
                        .replacingOccurrences(of: "\\\\", with: "\\")
        }
        if s.hasPrefix("'") && s.hasSuffix("'") && s.count >= 2 {
            let inner = String(s.dropFirst().dropLast())
            return inner.replacingOccurrences(of: "''", with: "'")
        }
        return s
    }

    // Double-quote a value when it contains characters that would be misread by a YAML parser.
    // Inside a flow sequence a comma anywhere in the value would also split it into two items.
    private static func quoteIfNeeded(_ s: String, inSequence: Bool = false) -> String {
        guard !s.isEmpty else { return "\"\"" }
        if inSequence && s.contains(",") { return doubleQuote(s) }
        let indicators: Set<Character> = ["-", "?", ",", "!", "|", ">", "'", "\"", "%", "@", "`", "&", "*", "#"]
        if let first = s.first, indicators.contains(first) { return doubleQuote(s) }
        if s.contains(": ") { return doubleQuote(s) }
        if s.contains(" #") { return doubleQuote(s) }
        if s.contains("[") || s.contains("]") || s.contains("{") || s.contains("}") { return doubleQuote(s) }
        return s
    }

    // A scalar written in the quotes it had, or else quoted only where its syntax needs it.
    private static func written(_ s: String, quotedAs style: QuoteStyle?, inSequence: Bool) -> String {
        switch style {
        case .double: return doubleQuote(s)
        case .single: return singleQuote(s)
        case nil: return quoteIfNeeded(s, inSequence: inSequence)
        }
    }

    private static func singleQuote(_ s: String) -> String {
        "'\(s.replacingOccurrences(of: "'", with: "''"))'"
    }

    private static func doubleQuote(_ s: String) -> String {
        let escaped = s.replacingOccurrences(of: "\\", with: "\\\\")
                       .replacingOccurrences(of: "\"", with: "\\\"")
        return "\"\(escaped)\""
    }

}
