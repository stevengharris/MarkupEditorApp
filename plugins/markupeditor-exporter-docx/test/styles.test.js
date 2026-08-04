import { describe, it, expect } from 'vitest'
import { Document, Paragraph, HeadingLevel } from 'docx'
import { documentStyles, BODY_FONT, DISPLAY_FONT } from '../src/styles.js'
import { decodeDocx, definedStyleIds, basedOnTargets } from './helpers/decodeDocx.js'

describe('documentStyles config object', () => {
    it('defines Normal, Quote, and DefaultParagraphFont', () => {
        const paragraphIds = documentStyles.paragraphStyles.map((s) => s.id)
        expect(paragraphIds).toContain('Normal')
        expect(paragraphIds).toContain('Quote')
        const characterIds = documentStyles.characterStyles.map((s) => s.id)
        expect(characterIds).toContain('DefaultParagraphFont')
    })

    it('sets document/body font to BODY_FONT and heading1/heading2 to DISPLAY_FONT', () => {
        expect(documentStyles.default.document.run.font).toBe(BODY_FONT)
        expect(documentStyles.default.heading1.run.font).toBe(DISPLAY_FONT)
        expect(documentStyles.default.heading2.run.font).toBe(DISPLAY_FONT)
        expect(documentStyles.default.heading3.run.font).toBe(BODY_FONT)
        expect(documentStyles.default.heading6.run.font).toBe(BODY_FONT)
    })

    it("carries Quote's indent on the style definition, not as a paragraph property", () => {
        const quote = documentStyles.paragraphStyles.find((s) => s.id === 'Quote')
        expect(quote.paragraph.indent.left).toBe(720)
    })
})

// Real generated output, decoded -- a dangling basedOn chain (missing Normal/
// DefaultParagraphFont) is only visible by decoding, not by asserting on the config object in
// isolation.
describe('documentStyles, decoded real docx output', () => {
    async function buildTestDoc() {
        const doc = new Document({
            styles: documentStyles,
            sections: [{
                children: [
                    new Paragraph({ text: 'A heading', heading: HeadingLevel.HEADING_1 }),
                    new Paragraph({ text: 'A plain paragraph.' }),
                    new Paragraph({ text: 'A quoted paragraph.', style: 'Quote' }),
                ],
            }],
        })
        return decodeDocx(doc)
    }

    it('defines Normal, DefaultParagraphFont, and Quote as real styleIds', async () => {
        const parts = await buildTestDoc()
        const ids = definedStyleIds(parts['word/styles.xml'])
        expect(ids.has('Normal')).toBe(true)
        expect(ids.has('DefaultParagraphFont')).toBe(true)
        expect(ids.has('Quote')).toBe(true)
    })

    it('resolves every basedOn target to a defined styleId', async () => {
        const parts = await buildTestDoc()
        const xml = parts['word/styles.xml']
        const ids = definedStyleIds(xml)
        for (const target of basedOnTargets(xml)) {
            expect(ids.has(target), `basedOn target "${target}" has no matching style definition`).toBe(true)
        }
    })

    it("carries Quote's indent in the style, with no direct w:ind on the paragraph", async () => {
        const parts = await buildTestDoc()
        const stylesXml = parts['word/styles.xml']
        const quoteBlock = stylesXml.match(/<w:style [^>]*w:styleId="Quote".*?<\/w:style>/s)[0]
        expect(quoteBlock).toContain('<w:ind w:left="720"/>')

        const docXml = parts['word/document.xml']
        const quoteParagraph = docXml.match(/<w:p>(?:(?!<w:p>).)*?w:pStyle w:val="Quote".*?<\/w:p>/s)[0]
        expect(quoteParagraph).not.toContain('w:ind')
    })

    it('has zero Times New Roman, Calibri, or Courier references', async () => {
        const parts = await buildTestDoc()
        const xml = parts['word/styles.xml']
        expect(xml).not.toMatch(/Times New Roman|Calibri|Courier/)
    })

    // docx's `default.headingN` config REPLACES a heading's entire built-in rPr rather than
    // merging with it -- adding only a font silently wipes the built-in w:sz, and with nothing
    // else in the document defining any size at all, every heading (and everything else)
    // would fall back to Word's absolute default size. The values asserted below are NOT
    // docx's built-in "Word template" scheme -- that scheme's blue heading color does not
    // exist anywhere in this app's real styling (markup.css sets no heading color at all).
    it('sets each heading\'s real, validated size/weight/spacing alongside the font override, not wiped and not a generic Word-template color', async () => {
        const parts = await buildTestDoc()
        const stylesXml = parts['word/styles.xml']
        const heading1 = stylesXml.match(/<w:style [^>]*w:styleId="Heading1".*?<\/w:style>/s)[0]
        expect(heading1).toContain('w:sz w:val="48"')
        expect(heading1).toContain('<w:b/>')
        expect(heading1).toContain('<w:spacing w:after="0" w:before="480"/>')
        expect(heading1).not.toContain('w:color')
        expect(heading1).toMatch(/w:ascii="SF Pro Display"/)
    })

    // A font set ONLY in docDefaults does not reliably cascade to styles with no rPr of their
    // own (Normal, ListParagraph, a plain italic run) even though the OOXML basedOn chain
    // resolves correctly -- the font must be set explicitly on Normal itself too.
    it('sets the font explicitly on the Normal style, not just docDefaults', async () => {
        const parts = await buildTestDoc()
        const stylesXml = parts['word/styles.xml']
        const normal = stylesXml.match(/<w:style [^>]*w:styleId="Normal".*?<\/w:style>/s)[0]
        expect(normal).toMatch(/w:ascii="SF Pro Text"/)
    })
})
