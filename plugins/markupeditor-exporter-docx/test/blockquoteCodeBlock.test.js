// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Document } from 'docx'
import { htmlToDocxChildren } from '../src/htmlToDocx.js'
import { documentStyles } from '../src/styles.js'
import { decodeDocx } from './helpers/decodeDocx.js'
import { quoteStyleId } from '../src/styles.js'

async function decode(html) {
    const warnings = []
    const children = htmlToDocxChildren(html, warnings)
    const doc = new Document({ styles: documentStyles, sections: [{ children }] })
    const parts = await decodeDocx(doc)
    return { xml: parts['word/document.xml'], warnings }
}

// Two real shapes, per markupeditor-base/src/schema/index.js: code_block's toDOM is bare
// <pre><code>; blockquote (content "block+") can wrap any block, including a code_block.
const BARE_CODE = '<pre><code class="language-swift">let x = 1</code></pre>'
const QUOTED_CODE = `<blockquote>${BARE_CODE}</blockquote>`
const QUOTED_PARAGRAPH = '<blockquote><p>quoted text</p></blockquote>'
const NESTED_QUOTED_PARAGRAPH = '<blockquote><blockquote><p>doubly quoted</p></blockquote></blockquote>'

describe('code_block: bare <pre><code>', () => {
    it('produces a paragraph with SF Mono runs containing the code text', async () => {
        const { xml, warnings } = await decode(BARE_CODE)
        expect(warnings).toEqual([])
        expect(xml).toContain('let x = 1')
        expect(xml).toContain('SF Mono')
    })

    it('drops the language-X class entirely -- decided, not surfaced anywhere', async () => {
        const { xml } = await decode(BARE_CODE)
        expect(xml).not.toContain('language-swift')
        expect(xml).not.toContain('language')
    })

    it('preserves multi-line whitespace and indentation exactly, as line breaks in ONE paragraph', async () => {
        const code = '  let x = 1\n    let y = 2\n  let z = 3'
        const html = `<pre><code>${code}</code></pre>`
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        const paragraphCount = (xml.match(/<w:p>/g) || []).length
        expect(paragraphCount).toBe(1) // one cohesive block, not one paragraph per line
        const breakCount = (xml.match(/<w:br\/>/g) || []).length
        expect(breakCount).toBe(2) // 3 lines -> 2 breaks
        expect(xml).toContain('  let x = 1')
        expect(xml).toContain('    let y = 2') // deeper leading indent preserved exactly
        expect(xml).toContain('  let z = 3')
    })

    it('has no direct w:ind (bare code_block has no quote context to conflict with)', async () => {
        const { xml } = await decode(BARE_CODE)
        const paragraphBlock = xml.match(/<w:p>.*?<\/w:p>/s)[0]
        expect(paragraphBlock).not.toContain('w:ind')
    })
})

describe('blockquote wrapping a paragraph', () => {
    it('applies the Quote style, with NO direct w:ind alongside it', async () => {
        const { xml, warnings } = await decode(QUOTED_PARAGRAPH)
        expect(warnings).toEqual([])
        const paragraphBlock = xml.match(/<w:p>(?:(?!<w:p>).)*?w:pStyle w:val="Quote".*?<\/w:p>/s)[0]
        expect(paragraphBlock).toContain('quoted text')
        expect(paragraphBlock).not.toContain('w:ind')
    })

    it('never emits the old non-standard 284-twip indent value anywhere', async () => {
        const { xml } = await decode(QUOTED_PARAGRAPH)
        expect(xml).not.toContain('284')
    })
})

describe('blockquote wrapping a code_block (demo.html\'s real shape)', () => {
    it('produces BOTH the Quote style AND SF Mono runs on the same paragraph', async () => {
        const { xml, warnings } = await decode(QUOTED_CODE)
        expect(warnings).toEqual([])
        const paragraphBlock = xml.match(/<w:p>(?:(?!<w:p>).)*?w:pStyle w:val="Quote".*?<\/w:p>/s)[0]
        expect(paragraphBlock).toContain('let x = 1')
        expect(paragraphBlock).toContain('SF Mono')
        expect(paragraphBlock).not.toContain('w:ind')
    })
})

describe('blockquote wrapping a heading', () => {
    // Regression test: a paragraph's `heading` and `style` are mutually exclusive in practice
    // (docx applies whichever is set, never both), so a heading nested inside a blockquote
    // cannot also carry the Quote-family style that gives blockquote content its indent. This
    // asserts the loss is surfaced as a warning, not silent.
    it('keeps the heading style and warns that the blockquote indent is not applied, rather than losing it silently', async () => {
        const { xml, warnings } = await decode('<blockquote><h2>quoted heading</h2></blockquote>')
        expect(xml).toContain('<w:pStyle w:val="Heading2"/>')
        expect(xml).toContain('quoted heading')
        expect(xml).not.toContain('w:ind')
        expect(warnings.some((w) => w.includes('blockquote') && w.includes('heading style'))).toBe(true)
    })
})

describe('nested blockquotes', () => {
    it('accumulates indentation strictly beyond a single level, via a named style (no direct w:ind)', async () => {
        const single = await decode(QUOTED_PARAGRAPH)
        const nested = await decode(NESTED_QUOTED_PARAGRAPH)
        expect(nested.warnings).toEqual([])

        // Single-level: Quote style, indent from styles.xml.
        const singleQuoteBlock = single.xml.match(/w:pStyle w:val="Quote"/)
        expect(singleQuoteBlock).not.toBeNull()

        // Nested (depth 2): a DIFFERENT, deeper-indent named style, not a direct w:ind.
        const nestedStyleMatch = nested.xml.match(/w:pStyle w:val="(Quote\d*)"/)
        expect(nestedStyleMatch).not.toBeNull()
        expect(nestedStyleMatch[1]).not.toBe('Quote') // must be a deeper level, not the same style
        const nestedParagraph = nested.xml.match(/<w:p>(?:(?!<w:p>).)*?<\/w:p>/s)[0]
        expect(nestedParagraph).not.toContain('w:ind')
        expect(nestedParagraph).toContain('doubly quoted')
    })

    it("depth-2 style's indent (in styles.xml) is strictly greater than depth-1's 720", async () => {
        const nested = await decode(NESTED_QUOTED_PARAGRAPH)
        const warnings = []
        const children = htmlToDocxChildren(NESTED_QUOTED_PARAGRAPH, warnings)
        const doc = new Document({ styles: documentStyles, sections: [{ children }] })
        const parts = await decodeDocx(doc)
        const stylesXml = parts['word/styles.xml']
        const depth2Id = quoteStyleId(2)
        const styleBlock = stylesXml.match(new RegExp(`<w:style [^>]*w:styleId="${depth2Id}".*?</w:style>`, 's'))[0]
        const indentMatch = styleBlock.match(/<w:ind w:left="(\d+)"/)
        expect(indentMatch).not.toBeNull()
        expect(Number(indentMatch[1])).toBeGreaterThan(720)
    })
})
