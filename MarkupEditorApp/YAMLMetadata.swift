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

// MARK: - Parser

/// Parse a raw YAML string (contents between `---` delimiters) into an ordered key-value array.
func parseYAMLMetadata(_ yaml: String, warnings: inout [String]) -> [(key: String, value: MetadataValue)] {
    var result: [(key: String, value: MetadataValue)] = []
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
            var j = i + 1
            while j < lines.count {
                let next = lines[j].trimmingCharacters(in: .whitespaces)
                if next.hasPrefix("- ") {
                    items.append(parseScalar(String(next.dropFirst(2)).trimmingCharacters(in: .whitespaces)))
                    j += 1
                } else if next.isEmpty {
                    j += 1
                } else {
                    break
                }
            }
            if !items.isEmpty {
                result.append((key: key, value: .array(items)))
                i = j
            } else {
                result.append((key: key, value: .scalar("")))
                i += 1
            }
        } else if rawValue.hasPrefix("[") {
            result.append((key: key, value: .array(parseFlowSequence(rawValue))))
            i += 1
        } else {
            result.append((key: key, value: .scalar(parseScalar(rawValue))))
            i += 1
        }
    }
    return result
}

// Returns the index of the first `:` that is not inside a quoted string.
private func firstUnquotedColon(in s: String) -> String.Index? {
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

// Parse a flow sequence string like `[a, "b", c]` into an array of scalar strings.
private func parseFlowSequence(_ s: String) -> [String] {
    var inner = s.trimmingCharacters(in: .whitespaces)
    if inner.hasPrefix("[") { inner = String(inner.dropFirst()) }
    if inner.hasSuffix("]") { inner = String(inner.dropLast()) }
    // Split on commas outside of quotes
    var items: [String] = []
    var current = ""
    var inSingle = false
    var inDouble = false
    for ch in inner {
        if ch == "'" && !inDouble { inSingle.toggle(); current.append(ch) }
        else if ch == "\"" && !inSingle { inDouble.toggle(); current.append(ch) }
        else if ch == "," && !inSingle && !inDouble {
            items.append(parseScalar(current.trimmingCharacters(in: .whitespaces)))
            current = ""
        } else {
            current.append(ch)
        }
    }
    let last = current.trimmingCharacters(in: .whitespaces)
    if !last.isEmpty { items.append(parseScalar(last)) }
    return items
}

// Strip quotes and handle escape sequences from a scalar token.
private func parseScalar(_ s: String) -> String {
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

// MARK: - Serializer

/// Serialize an ordered metadata array to a YAML string (without `---` delimiters).
func serializeYAMLMetadata(_ metadata: [(key: String, value: MetadataValue)]) -> String {
    var lines: [String] = []
    for entry in metadata {
        switch entry.value {
        case .scalar(let s):
            lines.append("\(entry.key): \(quoteIfNeeded(s))")
        case .array(let elements):
            let quoted = elements.map { quoteIfNeeded($0) }.joined(separator: ", ")
            lines.append("\(entry.key): [\(quoted)]")
        }
    }
    return lines.joined(separator: "\n") + (lines.isEmpty ? "" : "\n")
}

// Double-quote a value when it contains characters that would be misread by a YAML parser.
private func quoteIfNeeded(_ s: String) -> String {
    guard !s.isEmpty else { return "\"\"" }
    let indicators: Set<Character> = ["-", "?", ",", "!", "|", ">", "'", "\"", "%", "@", "`", "&", "*", "#"]
    if indicators.contains(s.first!) { return doubleQuote(s) }
    if s.contains(": ") { return doubleQuote(s) }
    if s.contains(" #") { return doubleQuote(s) }
    if s.contains("[") || s.contains("{") { return doubleQuote(s) }
    return s
}

private func doubleQuote(_ s: String) -> String {
    let escaped = s.replacingOccurrences(of: "\\", with: "\\\\")
                   .replacingOccurrences(of: "\"", with: "\\\"")
    return "\"\(escaped)\""
}
