//
//  SyntaxHighlighter.swift
//  MarkupEditorApp
//

import SwiftUI

enum SyntaxMode {
    case html, markdown
}

struct SyntaxHighlighter {

    let mode: SyntaxMode

    func highlight(_ source: String) -> AttributedString {
        var attributed = AttributedString(source)
        for (findRanges, style) in patterns {
            for range in findRanges(source) {
                guard let attrRange = convert(range, from: source, in: attributed) else { continue }
                style.apply(to: &attributed, in: attrRange)
            }
        }
        return attributed
    }

    // MARK: - Range conversion

    private func convert(_ range: Range<String.Index>, from source: String, in attributed: AttributedString) -> Range<AttributedString.Index>? {
        let startOffset = source.distance(from: source.startIndex, to: range.lowerBound)
        let length = source.distance(from: range.lowerBound, to: range.upperBound)
        let chars = attributed.characters
        guard startOffset + length <= chars.count else { return nil }
        let start = chars.index(chars.startIndex, offsetBy: startOffset)
        let end = chars.index(start, offsetBy: length)
        return start..<end
    }

    // MARK: - Pattern selection

    private typealias RangeFinder = (String) -> [Range<String.Index>]

    private var patterns: [(RangeFinder, TokenStyle)] {
        mode == .html ? Self.htmlPatterns : Self.markdownPatterns
    }

    // Whole match: return ranges of all matches.
    private static func all<O>(_ regex: Regex<O>) -> RangeFinder {
        { $0.ranges(of: regex) }
    }

    // First capture group only: style just the captured span, not the surrounding context.
    private static func cap1(_ regex: Regex<(Substring, Substring)>) -> RangeFinder {
        { $0.matches(of: regex).map { $0.output.1.startIndex ..< $0.output.1.endIndex } }
    }

    // MARK: - HTML patterns (lower-priority patterns listed first; last write wins on overlap)

    private static let htmlPatterns: [(RangeFinder, TokenStyle)] = [
        (all(#/(?s)<!--.*?-->/#),                          .color(.green)),
        (all(#/<\/?[a-zA-Z][^>]*?\/?>/# ),                .color(.blue)),
        (all(#/(?i)<img[^>]*>/#),                          .color(.purple)),
        // Swift regex doesn't support lookbehinds; match `=value` and color just the value (cap1).
        (cap1(#/=("[^"\n]*"|'[^'\n]*')/#),                .color(.orange)),
    ]

    // MARK: - Markdown patterns
    // Italic before bold so bold overwrites on overlap (** vs *).
    //
    // Lookbehind replacements (Swift regex doesn't support lookbehinds in literals):
    //   (?<!\s) before closing delimiter → [^x\s] as the last content character
    //   (?<![a-zA-Z0-9]) before opening delimiter → (?:^|[^a-zA-Z0-9]) consumed as
    //     context outside a capture group; cap1 extracts just the _…_ or __…__ span.
    //   NOTE: adjacent spans with only _ between them (e.g. _a__b_) match only the
    //   first span under this scheme; the original lookbehind matched both. Acceptable
    //   trade-off — that form is non-standard Markdown and most parsers reject it.

    private static let markdownPatterns: [(RangeFinder, TokenStyle)] = [
        // img before code so inline code overwrites it (last write wins).
        (all(#/(?i)<img[^>]*>/#),                                                             .color(.purple)),
        (all(#/(?s)```.*?```/#),                                                              .color(.gray)),
        (all(#/`[^`\n]+`/#),                                                                  .color(.gray)),
        (all(#/\*(?!\s)[^*\n]*[^*\n\s]\*/#),                                                .font(.body.monospaced().italic())),
        (cap1(#/(?:^|[^a-zA-Z0-9])(_(?!\s)[^_\n]*[^_\n\s]_)(?![a-zA-Z0-9])/#),            .font(.body.monospaced().italic())),
        (all(#/\*\*(?!\s)[^*\n]*[^*\n\s]\*\*/#),                                            .font(.body.monospaced().bold())),
        (cap1(#/(?:^|[^a-zA-Z0-9])(__(?!\s)[^_\n]*[^_\n\s]__)(?![a-zA-Z0-9])/#),          .font(.body.monospaced().bold())),
        (all(#/(?m)^# .*$/#),      .both(color: .blue, font: .system(size: 22, weight: .regular, design: .monospaced))),
        (all(#/(?m)^## .*$/#),     .both(color: .blue, font: .system(size: 20, weight: .regular, design: .monospaced))),
        (all(#/(?m)^### .*$/#),    .both(color: .blue, font: .system(size: 18, weight: .regular, design: .monospaced))),
        (all(#/(?m)^#### .*$/#),   .both(color: .blue, font: .system(size: 16, weight: .regular, design: .monospaced))),
        (all(#/(?m)^##### .*$/#),  .both(color: .blue, font: .system(size: 15, weight: .regular, design: .monospaced))),
        (all(#/(?m)^###### .*$/#), .both(color: .blue, font: .system(size: 14, weight: .regular, design: .monospaced))),
        (all(#/\[[^\[\]]+\]\([^)]+\)/#),                                                      .color(.purple)),
    ]
    
    //static func testLookBehinds() {
    //    let text = "Learn #SwiftUI and #iOS on macOS."
    //    let regex = #"(?<=#)\w+"#

    //    if let match = text.firstMatch(of: /(?<=#)\w+/) {
    //        print("Found match: \(match.output)") // Prints: SwiftUI
    //    }

    //    // Extracting all matches
    //    let matches = text.matches(of: regex)
    //    for match in matches {
    //        print(match.output)
    //    }
    //}
}

// MARK: - TokenStyle

private enum TokenStyle {
    case color(Color)
    case font(Font)
    case both(color: Color, font: Font)

    func apply(to attributed: inout AttributedString, in range: Range<AttributedString.Index>) {
        switch self {
        case .color(let c):
            attributed[range].foregroundColor = c
        case .font(let f):
            attributed[range].font = f
        case .both(let c, let f):
            attributed[range].foregroundColor = c
            attributed[range].font = f
        }
    }
}
