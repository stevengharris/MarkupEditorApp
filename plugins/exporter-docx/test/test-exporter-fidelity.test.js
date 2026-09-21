// @vitest-environment jsdom
//
// Document-fidelity coverage for the DocX exporter, driven off ONE real document --
// plugins/test-exporter.md, rendered through the real importMarkdown() path and exported
// through the real DocX plugin pipeline (DocXExporter.run(), full: resolveImages ->
// htmlToDocxChildren -> Packer) -- rather than many small hand-crafted HTML snippets.
// Assertions stay individually named per construct against this one decoded document: only
// the INPUT consolidates, not per-construct failure diagnosability.
//
// Behaviors test-exporter.md's real content does not exercise (heading id/link title dropping,
// hard_break, u/sub/sup marks, marks combining onto one run, multi-line code_block whitespace,
// blockquote wrapping a code_block/heading, ordered_list start, table class variations/colspan/
// rowspan/cell background, an <li> with two paragraphs, unresolved/undersized image handling,
// malformed table structure) stay covered as targeted synthetic-snippet cases in
// htmlToDocx.test.js, which already exists for exactly this kind of internal/dispatch coverage.
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MU } from 'markupeditor'
import { renderTestDocument } from './helpers/renderTestDocument.js'
import { decodeDocxBuffer, definedStyleIds, basedOnTargets } from './helpers/decodeDocx.js'
import { BODY_FONT, DISPLAY_FONT } from '../src/styles.js'

// A minimal but genuinely valid 1x1 PNG, base64-encoded -- resolveImages is mocked wholesale
// below: the unmocked Image/canvas path hangs indefinitely in this environment (no real
// browser image decoder), and real image-loading fidelity is verified manually, unchanged
// from today. The mock only needs to prove the placement/sizing/attribute-rewriting logic
// downstream of loading, which the document's own width/height attributes already drive.
const FIXTURE_IMAGE_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

vi.mock('../src/resolveImages.js', () => ({
    resolveImages: async (html) =>
        html.replace(/(<img\b[^>]*\bsrc\s*=\s*)["'][^"']+["']/gi, `$1"data:image/png;base64,${FIXTURE_IMAGE_BASE64}"`),
}))

// docxexporter.js's own `import { MU } from "markupeditor"` resolves to the same real,
// aliased MU object imported above (registerPlugin() below is a real, harmless registry
// write, not mocked) -- no separate 'markupeditor' mock. A vi.mock('markupeditor', ...) here
// would replace the module for the whole graph reachable from this test file, including
// markdown.js's own MU import (via renderTestDocument.js) -- losing MU.schema/activeView,
// which renderTestDocument.js needs to be real.
const { docXExporter } = await import('../src/docxexporter.js')

let xml, stylesXml, numberingXml, rels, coreXml, exportWarnings

beforeAll(async () => {
    const md = readFileSync(path.resolve(import.meta.dirname, 'fixtures/test-exporter.md'), 'utf8')
    const rendered = renderTestDocument(md)
    expect(rendered.warnings).toEqual([])

    // docXExporter.run() reads MU.getHTML() AND MU.activeView() internally -- monkey-patched
    // here, not a separate mock module. renderTestDocument.js only returns the fixture's raw
    // YAML text (rendered.metadata) since importMarkdown() strips frontmatter from the HTML
    // instead of seeding it into the doc -- that seeding is Swift-side
    // (MarkupDocument.seedMetadataBlock), outside this harness's reach, so both the doc-model
    // node and the leading <pre><code class="language-metadata"> HTML are faked here, matching
    // seedMetadataBlock's escaping (& first, then </>). This catches getHTML() leaking metadata
    // into exported body content, and lets extractMetadata() see the fixture's real frontmatter
    // instead of the real bundle's default activeView() (no live editor in this harness).
    const escapedMetadata = (rendered.metadata ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const htmlWithSeededMetadata = rendered.metadata
        ? `<pre><code class="language-metadata">${escapedMetadata}</code></pre>${rendered.html}`
        : rendered.html
    const originalGetHTML = MU.getHTML
    const originalActiveView = MU.activeView
    MU.getHTML = () => htmlWithSeededMetadata
    MU.activeView = () => ({
        state: {
            doc: {
                firstChild: rendered.metadata
                    ? { type: { name: 'code_block' }, attrs: { language: 'metadata' }, textContent: rendered.metadata }
                    : null,
            },
        },
    })

    let envelope
    try {
        envelope = JSON.parse(await docXExporter.run())
    } finally {
        MU.getHTML = originalGetHTML
        MU.activeView = originalActiveView
    }
    exportWarnings = envelope.warnings
    const buffer = Buffer.from(envelope.result, 'base64')
    const parts = await decodeDocxBuffer(buffer)
    xml = parts['word/document.xml']
    stylesXml = parts['word/styles.xml']
    numberingXml = parts['word/numbering.xml']
    rels = parts['word/_rels/document.xml.rels']
    coreXml = parts['docProps/core.xml']
})

describe('headings H1-H6', () => {
    it('renders every level with its Heading style and text', () => {
        expect(xml).toContain('<w:pStyle w:val="Heading1"/>')
        expect(xml).toContain('Test Document') // the document body's H1 text (frontmatter's `title` is deliberately different -- see the metadata describe block below)
        expect(xml).toContain('H1 Style')
        for (let level = 2; level <= 6; level++) {
            expect(xml).toContain(`<w:pStyle w:val="Heading${level}"/>`)
            expect(xml).toContain(`H${level} Style`)
        }
    })
})

describe('code block', () => {
    it('renders the fenced ```html block as an SF Mono paragraph with the language class dropped', () => {
        expect(xml).toContain('Code Style')
        expect(xml).toContain('SF Mono')
        expect(xml).not.toContain('language-html')
    })
})

describe('metadata', () => {
    it('does not leak the metadata block into the visible body -- it is data about the document, not part of it', () => {
        expect(xml).not.toContain('Steven G. Harris')
        expect(xml).not.toContain('language-metadata')
    })

    it('pulls creator/title/description/keywords from the fixture\'s real frontmatter into core-properties', () => {
        expect(coreXml).toContain('<dc:creator>Steven G. Harris</dc:creator>')
        // Deliberately different from the document body's H1 ("Test Document") -- proves the
        // frontmatter title overrides rather than coincidentally matches.
        expect(coreXml).toContain('<dc:title>MarkupEditor Fidelity Testing</dc:title>')
        expect(coreXml).toContain('<dc:description>A baseline test document exercising every element the MarkupEditor supports.</dc:description>')
        expect(coreXml).toContain('MarkupEditor, testing, fidelity')
    })
})

describe('marks', () => {
    it('bold text carries <w:b/>', () => {
        const run = xml.match(/<w:r>(?:(?!<w:r>).)*Bold text.*?<\/w:r>/s)[0]
        expect(run).toContain('<w:b/>')
    })

    it('italic text carries <w:i/>', () => {
        const run = xml.match(/<w:r>(?:(?!<w:r>).)*Italic text.*?<\/w:r>/s)[0]
        expect(run).toContain('<w:i/>')
    })

    it('inline code text gets SF Mono font and F8F8F8 shading', () => {
        const run = xml.match(/<w:r>(?:(?!<w:r>).)*Code text.*?<\/w:r>/s)[0]
        expect(run).toMatch(/<w:rFonts[^>]*w:ascii="SF Mono"/)
        expect(run).toMatch(/<w:shd[^>]*w:fill="F8F8F8"/)
    })

    it('strikethrough text carries <w:strike/> with no leading/trailing whitespace run', () => {
        const paragraph = xml.match(/<w:p>(?:(?!<w:p>).)*Strikethrough text.*?<\/w:p>/s)[0]
        expect(paragraph).toContain('<w:strike/>')
        // Exactly one run: no spurious leading/trailing whitespace-only TextRun (see
        // isInsignificantWhitespace in htmlToDocx.js).
        expect((paragraph.match(/<w:r>/g) || []).length).toBe(1)
    })
})

describe('links', () => {
    it('the external link produces a real hyperlink relationship using the Hyperlink style', () => {
        expect(xml).toContain('<w:hyperlink')
        expect(xml).toContain('w:val="Hyperlink"')
        expect(rels).toContain('https://foo.com')
        expect(rels).toMatch(/Type="[^"]*hyperlink"/i)
    })

    it('the internal (#test-document) link is dropped to plain text with a warning, since headings never emit a bookmark', () => {
        expect(xml).toContain('to an internal header using the Markdown convention')
        expect(xml).not.toContain('#test-document')
        expect(exportWarnings.some((w) => w.includes('internal link'))).toBe(true)
    })
})

describe('images: local, remote, and blockquote-indented', () => {
    it('embeds all three images as real drawings with distinct docPr ids', () => {
        const drawingCount = (xml.match(/<w:drawing>/g) || []).length
        expect(drawingCount).toBe(3)
        const ids = [...xml.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1])
        expect(ids.length).toBe(3)
        expect(new Set(ids).size).toBe(3)
    })

    it('sizes the local image (144x144) and remote image (128x128) from their real width/height attributes', () => {
        expect(xml).toContain(`cx="${144 * 9525}"`)
        expect(xml).toContain(`cy="${144 * 9525}"`)
        expect(xml).toContain(`cx="${128 * 9525}"`)
        expect(xml).toContain(`cy="${128 * 9525}"`)
    })

    it('registers a real image relationship, content-addressed (all three images share one fixture, so one media part)', () => {
        expect(rels).toMatch(/Type="[^"]*\/image"/)
        expect(rels).toContain('media/')
    })

    it('the indented image sits inside a Quote-styled paragraph, not a plain one', () => {
        const quoteParagraphs = xml.match(/<w:p>(?:(?!<w:p>).)*?w:pStyle w:val="Quote".*?<\/w:p>/gs) || []
        expect(quoteParagraphs.some((p) => p.includes('<w:drawing>'))).toBe(true)
    })
})

describe('tables', () => {
    it('the simple one-column table renders three rows with real cell text, no bordered-table-* class applied (default: full grid)', () => {
        expect(xml).toContain('A table with a header,')
        expect(xml).toContain('containing')
        expect(xml).toContain('and')
        const gridCols = xml.match(/<w:gridCol w:w="(\d+)"\/>/)
        expect(gridCols).not.toBeNull()
    })

    // The second table's real content is reduced to a single column by a confirmed, tracked,
    // OUT-OF-SCOPE bug (MarkupEditorApp-wrrx: exportMarkdown loses table-cell formatting,
    // lists, and images) in a different layer (markupeditor-app/markupeditor-base's Markdown
    // serializer) -- this asserts what the DocX converter actually receives and faithfully
    // converts, not what the source markdown intended.
    it('the second table converts whatever content the real markdown pipeline actually produced for it', () => {
        expect(xml).toContain('A table with various paragraph styles and items in it')
        expect(xml).toContain('A list')
    })

    it('every table renders as a real, valid Table structure (tblLayout fixed, percentage width)', () => {
        expect((xml.match(/<w:tbl>/g) || []).length).toBe(2)
        expect(xml).toContain('<w:tblLayout w:type="fixed"/>')
        expect(xml).toContain('<w:tblW w:type="pct" w:w="100%"/>')
    })
})

describe('nested lists', () => {
    it('bulleted > bulleted (same format) > numbered (different format): correct ilvl at every depth', () => {
        expect(xml).toContain('A bulleted list')
        expect(xml).toContain('with a sublist')
        expect(xml).toContain('and a numbered')
        expect(xml).toContain('sublist within it.')
        expect(xml).toMatch(/<w:ilvl w:val="0"\/>/)
        expect(xml).toMatch(/<w:ilvl w:val="1"\/>/)
        expect(xml).toMatch(/<w:ilvl w:val="2"\/>/)
    })

    it('numbered > numbered (same format) > bulleted (different format): correct ilvl at every depth', () => {
        expect(xml).toContain('A numbered list')
        expect(xml).toContain('and a bulleted')
    })

    it('defines both bullet and decimal abstract numbering', () => {
        expect(numberingXml).toContain('w:numFmt w:val="bullet"')
        expect(numberingXml).toContain('w:numFmt w:val="decimal"')
    })
})

describe('nested blockquotes', () => {
    it('a doubly-indented paragraph gets a deeper Quote-family style than the single-indented one, no direct w:ind', () => {
        expect(xml).toContain('An indented (aka quoted) paragraph.')
        expect(xml).toContain('A doubly-indented paragraph.')
        const nestedParagraph = xml.match(/<w:p>(?:(?!<w:p>).)*doubly-indented.*?<\/w:p>/s)[0]
        expect(nestedParagraph).not.toContain('w:ind')
        const nestedStyleMatch = nestedParagraph.match(/w:pStyle w:val="(Quote\d*)"/)
        expect(nestedStyleMatch).not.toBeNull()
        expect(nestedStyleMatch[1]).not.toBe('Quote')
    })
})

describe('horizontal rule', () => {
    it('renders a Body-styled paragraph with a single bottom border, no content', () => {
        const hrParagraph = xml.match(/<w:p><w:pPr><w:pStyle w:val="Body"\/><w:pBdr>.*?<\/w:p>/s)
        expect(hrParagraph).not.toBeNull()
        expect(hrParagraph[0]).toContain('<w:bottom')
        expect(hrParagraph[0]).toMatch(/w:val="single"/)
    })
})

describe('documentStyles, decoded from the real document (content-independent: styles.xml is driven by documentStyles alone)', () => {
    it('defines Normal, Quote, and DefaultParagraphFont', () => {
        const ids = definedStyleIds(stylesXml)
        expect(ids.has('Normal')).toBe(true)
        expect(ids.has('Quote')).toBe(true)
        expect(ids.has('DefaultParagraphFont')).toBe(true)
    })

    it('resolves every basedOn target to a defined styleId (no dangling reference)', () => {
        const ids = definedStyleIds(stylesXml)
        for (const target of basedOnTargets(stylesXml)) {
            expect(ids.has(target), `basedOn target "${target}" has no matching style definition`).toBe(true)
        }
    })

    it('sets document/body font to BODY_FONT and heading1/heading2 to DISPLAY_FONT, heading3-6 to BODY_FONT', () => {
        const heading1 = stylesXml.match(/<w:style [^>]*w:styleId="Heading1".*?<\/w:style>/s)[0]
        const heading3 = stylesXml.match(/<w:style [^>]*w:styleId="Heading3".*?<\/w:style>/s)[0]
        const normal = stylesXml.match(/<w:style [^>]*w:styleId="Normal".*?<\/w:style>/s)[0]
        expect(heading1).toMatch(new RegExp(`w:ascii="${DISPLAY_FONT}"`))
        expect(heading3).toMatch(new RegExp(`w:ascii="${BODY_FONT}"`))
        expect(normal).toMatch(new RegExp(`w:ascii="${BODY_FONT}"`)) // explicit on Normal, not just docDefaults
    })

    it('has zero Times New Roman, Calibri, or Courier references', () => {
        expect(stylesXml).not.toMatch(/Times New Roman|Calibri|Courier/)
    })

    it("carries Quote's indent on the style definition, not as a direct paragraph w:ind", () => {
        const quoteStyleBlock = stylesXml.match(/<w:style [^>]*w:styleId="Quote".*?<\/w:style>/s)[0]
        expect(quoteStyleBlock).toContain('<w:ind w:left="720"/>')
        const quoteParagraph = xml.match(/<w:p>(?:(?!<w:p>).)*?w:pStyle w:val="Quote"(?!\d).*?<\/w:p>/s)[0]
        expect(quoteParagraph).not.toContain('w:ind')
    })
})
