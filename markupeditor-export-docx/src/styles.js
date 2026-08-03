// SF Pro Text/Display ship alongside Xcode/SF Symbols, not the base macOS image; SF Mono
// ships with the OS. Using SF Pro anyway is a deliberate trade-off for a macOS app that
// already requires Xcode to build.
export const BODY_FONT = 'SF Pro Text'
export const DISPLAY_FONT = 'SF Pro Display'
export const CODE_FONT = 'SF Mono'

// docx's built-in Title/Heading1-6/Strong/ListParagraph/Hyperlink/FootnoteText/EndnoteText
// styles all declare basedOn="Normal", and Hyperlink/FootnoteReference/FootnoteTextChar/
// EndnoteReference/EndnoteTextChar declare basedOn="DefaultParagraphFont", but docx never
// defines either base style itself -- every basedOn reference is dangling unless defined
// here. An undefined basedOn target produces visible Pages corruption (a trailing "*" on
// every paragraph's style name, styles bleeding onto adjacent unstyled paragraphs), confirmed
// by decoding a real generated styles.xml.
//
// docx has no first-class "tableStyles" config (see convertTable in htmlToDocx.js -- table
// borders are set directly per table instead).
//
// Nested blockquotes accumulate indent per level, but a paragraph carries only one pStyle,
// and a direct w:ind alongside a style reference is the "manual override" signal Pages flags
// -- so every nesting level needs its own named style rather than a paragraph-level override.
// This pre-generates a bounded family of Quote styles (Quote, Quote2, Quote3, ...), each with
// its own indent. Deeper nesting clamps to the deepest defined style with a warning (see
// htmlToDocx.js).
export const QUOTE_MAX_DEPTH = 6
const QUOTE_INDENT_STEP = 720

export function quoteStyleId(depth) {
    return depth <= 1 ? 'Quote' : `Quote${depth}`
}

const quoteStyles = Array.from({ length: QUOTE_MAX_DEPTH }, (_, i) => {
    const depth = i + 1
    return {
        // Matches this app's blockquote appearance, not Word's decorative built-in Quote
        // style (centered + italic).
        id: quoteStyleId(depth),
        name: depth === 1 ? 'Quote' : `Quote ${depth}`,
        basedOn: 'Normal',
        next: 'Normal',
        quickFormat: true,
        paragraph: { indent: { left: QUOTE_INDENT_STEP * depth } },
    }
})

// docx's `default.headingN` config REPLACES a heading's entire built-in run properties rather
// than merging with them, confirmed by decoding real output: adding only `{run: {font:
// ...}}` silently wiped the built-in w:sz/w:color. Every property a heading needs (font,
// size, weight, spacing) must be set explicitly here.
//
// No heading color is set below, deliberately -- markup.css defines no heading color at all
// (headings inherit plain black text), so docx's built-in Word-template blue would be a
// visible mismatch. Sizes are in half-points, spacing in twips.
//
// `next: 'Body'` on every heading, plus a real "Body" style below rather than relying on
// "Normal" alone: Pages' native paragraph-style vocabulary is "Body"/"Heading" (no "1"), not
// Word's "Normal"/"Heading1" convention, and a plain unstyled paragraph does not reliably
// resolve to a named style in Pages. Pages' generator also never uses `basedOn` for its core
// styles -- each is fully self-contained. `Body` follows that pattern: no `basedOn`,
// font/size/spacing set directly.
export const documentStyles = {
    default: {
        document: { run: { font: BODY_FONT } },
        title: { run: { font: DISPLAY_FONT, size: 56 } },
        heading1: {
            run: { font: DISPLAY_FONT, size: 48, bold: true },
            paragraph: { spacing: { before: 480, after: 0 } },
            next: 'Body',
        },
        heading2: {
            run: { font: DISPLAY_FONT, size: 36, bold: true },
            paragraph: { spacing: { before: 360, after: 80 } },
            next: 'Body',
        },
        heading3: {
            run: { font: BODY_FONT, size: 28, bold: true },
            paragraph: { spacing: { before: 280, after: 80 } },
            next: 'Body',
        },
        heading4: {
            run: { font: BODY_FONT, size: 24, bold: true },
            paragraph: { spacing: { before: 240, after: 40 } },
            next: 'Body',
        },
        heading5: {
            run: { font: BODY_FONT, size: 22, bold: true },
            paragraph: { spacing: { before: 220, after: 40 } },
            next: 'Body',
        },
        heading6: {
            run: { font: BODY_FONT, size: 20, bold: true },
            paragraph: { spacing: { before: 200, after: 40 } },
            next: 'Body',
        },
    },
    paragraphStyles: [
        {
            id: 'Normal',
            name: 'Normal',
            quickFormat: true,
            run: { font: BODY_FONT, size: 22 },
        },
        {
            // Referenced by plain paragraphs (see convertParagraph in htmlToDocx.js) --
            // matches Pages' native "Body" concept by name, not just the OOXML-required
            // "Normal". Font/size/spacing are set explicitly on the style rather than left to
            // docDefaults alone, since a docDefaults-only setting does not reliably cascade to
            // a paragraph with no rPr in Pages.
            id: 'Body',
            name: 'Body',
            quickFormat: true,
            next: 'Body',
            run: { font: BODY_FONT, size: 22 },
            paragraph: { spacing: { after: 120 } },
        },
        ...quoteStyles,
    ],
    characterStyles: [
        {
            id: 'DefaultParagraphFont',
            name: 'Default Paragraph Font',
        },
    ],
}
