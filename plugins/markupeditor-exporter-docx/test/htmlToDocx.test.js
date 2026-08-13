// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Document } from 'docx'
import { htmlToDocxChildren, convertBlock } from '../src/htmlToDocx.js'
import { documentStyles } from '../src/styles.js'
import { numberingConfig } from '../src/numbering.js'
import { decodeDocx } from './helpers/decodeDocx.js'

// Shared by every describe block below: converts html to docx children, packs a real
// Document, and decodes it -- same contract as test-exporter-fidelity.test.js's helper, but
// these tests exist for hand-crafted-snippet edge cases and converter decisions that
// test-exporter.md's real content doesn't exercise, not document fidelity.
async function decode(html) {
    const warnings = []
    const children = htmlToDocxChildren(html, warnings)
    const doc = new Document({
        styles: documentStyles,
        numbering: { config: numberingConfig },
        sections: [{ children }],
    })
    const parts = await decodeDocx(doc)
    return { xml: parts['word/document.xml'], rels: parts['word/_rels/document.xml.rels'], numberingXml: parts['word/numbering.xml'], warnings }
}

// Tag inventory from markupeditor-base/src/schema/index.js. tr/td/th are tested here nested
// inside a real <table>, not standalone -- the HTML parser foster-parents a bare
// <tr>/<td>/<th> outside table context, confirmed empirically. li and tr/td/th are only ever
// reached via their parent's dispatch (convertList/convertTable), never standalone, so their
// BLOCK_HANDLERS entries are an intentionally-inert fallback.
describe('htmlToDocxChildren dispatch completeness', () => {
    it('has a dispatch entry for tr/td/th, tested in real table context', () => {
        const parsed = new DOMParser().parseFromString(
            '<table><tr><th></th><td></td></tr></table>', 'text/html'
        )
        const table = parsed.body.querySelector('table')
        const tr = parsed.body.querySelector('tr')
        const th = parsed.body.querySelector('th')
        const td = parsed.body.querySelector('td')
        expect([table, tr, th, td].every(Boolean)).toBe(true) // sanity: parser kept them all

        for (const el of [tr, th, td]) {
            const warnings = []
            convertBlock(el, { warnings })
            expect(warnings).toEqual([`<${el.tagName.toLowerCase()}> is recognized but not yet converted`])
        }
    })

    it('warns loudly on a genuinely unrecognized tag, without throwing or silently dropping it', () => {
        const warnings = []
        expect(() => htmlToDocxChildren('<foo>bar</foo>', warnings)).not.toThrow()
        expect(warnings).toEqual(['unhandled tag <foo>'])
    })
})

describe('htmlToDocxChildren, div/button/plain-paragraph conversion', () => {
    it('converts a trivial <p> to a docx Paragraph containing its text, verified via real decoded output', async () => {
        const warnings = []
        const children = htmlToDocxChildren('<p>Hello, docx.</p>', warnings)
        expect(warnings).toEqual([])
        const doc = new Document({ styles: documentStyles, sections: [{ children }] })
        const parts = await decodeDocx(doc)
        expect(parts['word/document.xml']).toContain('Hello, docx.')
    })

    it('recurses into a <div>, discarding the wrapper but keeping its content', () => {
        const warnings = []
        const children = htmlToDocxChildren('<div id="x" class="y"><p>inside</p></div>', warnings)
        expect(warnings).toEqual([])
        expect(children.length).toBe(1) // just the paragraph -- the div itself emits nothing
    })

    it('drops <button> entirely with no warning (explicit user decision, not a gap)', () => {
        const warnings = []
        const children = htmlToDocxChildren('<button type="button">Click</button>', warnings)
        expect(children).toEqual([])
        expect(warnings).toEqual([])
    })
})

describe('heading edge cases (not present in test-exporter.md, which has no id/style-conflict headings)', () => {
    it('drops the heading id attribute -- no bookmark, by decision', async () => {
        const { xml, warnings } = await decode('<h1 id="section-1">Title text</h1>')
        expect(warnings).toEqual([])
        expect(xml).not.toContain('section-1')
        expect(xml).not.toContain('<w:bookmarkStart')
    })

    it('never emits direct run-level font/size overrides fighting the Heading style', async () => {
        const { xml } = await decode('<h2>Title text</h2>')
        const paragraphBlock = xml.match(/<w:p>(?:(?!<w:p>).)*?w:pStyle w:val="Heading2".*?<\/w:p>/s)[0]
        expect(paragraphBlock).not.toContain('<w:sz')
        expect(paragraphBlock).not.toContain('<w:rFonts')
    })
})

describe('hard_break (not present in test-exporter.md)', () => {
    it('converts <br> to a break inside the SAME paragraph, not a second paragraph', async () => {
        const { xml, warnings } = await decode('<p>before<br>after</p>')
        expect(warnings).toEqual([])
        const paragraphCount = (xml.match(/<w:p>/g) || []).length
        expect(paragraphCount).toBe(1)
        expect(xml).toContain('<w:br/>')
        expect(xml).toContain('before')
        expect(xml).toContain('after')
    })
})

describe('u/sub/sup marks, and marks combining (not present in test-exporter.md, which only exercises strong/em/code/s)', () => {
    const cases = [
        { tag: 'u', html: '<p><u>underlined</u></p>', expect: /<w:u w:val=/ },
        { tag: 'sub', html: '<p><sub>lowered</sub></p>', expect: /w:val="subscript"/ },
        { tag: 'sup', html: '<p><sup>raised</sup></p>', expect: /w:val="superscript"/ },
    ]
    for (const c of cases) {
        it(`<${c.tag}>`, async () => {
            const { xml, warnings } = await decode(c.html)
            expect(warnings).toEqual([])
            expect(xml).toMatch(c.expect)
        })
    }

    it('produces ONE run with bold, italics, AND underline, not nested/duplicated runs', async () => {
        const { xml, warnings } = await decode('<p><strong><em><u>all three</u></em></strong></p>')
        expect(warnings).toEqual([])
        const run = xml.match(/<w:r>.*?<\/w:r>/s)[0]
        expect(run).toContain('<w:b/>')
        expect(run).toContain('<w:i/>')
        expect(run).toMatch(/<w:u w:val=/)
        expect(run).toContain('all three')
        expect((xml.match(/<w:r>/g) || []).length).toBe(1)
    })

    it('a mark spanning a <br> keeps the mark on both sides, not just before it', async () => {
        const { xml, warnings } = await decode('<p><strong>before<br>after</strong></p>')
        expect(warnings).toEqual([])
        expect(xml).toContain('before')
        expect(xml).toContain('after')
        expect(xml).toContain('<w:br/>')
        expect((xml.match(/<w:b\/>/g) || []).length).toBe(3)
    })

    it('bold inline code combines onto one run, not nested/duplicated', async () => {
        const { xml, warnings } = await decode('<p><strong><code>bold code</code></strong></p>')
        expect(warnings).toEqual([])
        const run = xml.match(/<w:r>.*?<\/w:r>/s)[0]
        expect(run).toContain('<w:b/>')
        expect(run).toMatch(/w:ascii="SF Mono"/)
        expect(run).toContain('bold code')
        expect((xml.match(/<w:r>/g) || []).length).toBe(1)
    })
})

describe('link title attribute (not present in test-exporter.md)', () => {
    it('drops the link title attribute -- no tooltip/comment, by decision', async () => {
        const { xml } = await decode('<p><a href="https://example.com" title="a tooltip">text</a></p>')
        expect(xml).not.toContain('a tooltip')
    })
})

describe('code_block multi-line whitespace (test-exporter.md\'s code block is a single line)', () => {
    it('preserves multi-line whitespace and indentation exactly, as line breaks in ONE paragraph', async () => {
        const code = '  let x = 1\n    let y = 2\n  let z = 3'
        const { xml, warnings } = await decode(`<pre><code>${code}</code></pre>`)
        expect(warnings).toEqual([])
        expect((xml.match(/<w:p>/g) || []).length).toBe(1)
        expect((xml.match(/<w:br\/>/g) || []).length).toBe(2)
        expect(xml).toContain('  let x = 1')
        expect(xml).toContain('    let y = 2')
        expect(xml).toContain('  let z = 3')
    })
})

describe('blockquote wrapping code_block/heading (not present in test-exporter.md, which only nests blockquote>paragraph and blockquote>image)', () => {
    it('a blockquote wrapping a code_block gets BOTH the Quote style AND SF Mono runs', async () => {
        const { xml, warnings } = await decode('<blockquote><pre><code class="language-swift">let x = 1</code></pre></blockquote>')
        expect(warnings).toEqual([])
        const paragraphBlock = xml.match(/<w:p>(?:(?!<w:p>).)*?w:pStyle w:val="Quote".*?<\/w:p>/s)[0]
        expect(paragraphBlock).toContain('let x = 1')
        expect(paragraphBlock).toContain('SF Mono')
        expect(paragraphBlock).not.toContain('w:ind')
    })

    // heading and style are mutually exclusive on a docx Paragraph, so a heading inside a
    // blockquote can't also carry the Quote-family style that gives blockquote content its
    // indent -- this asserts the loss is surfaced as a warning, not silent.
    it('a blockquote wrapping a heading keeps the heading style and warns the indent is not applied', async () => {
        const { xml, warnings } = await decode('<blockquote><h2>quoted heading</h2></blockquote>')
        expect(xml).toContain('<w:pStyle w:val="Heading2"/>')
        expect(xml).toContain('quoted heading')
        expect(xml).not.toContain('w:ind')
        expect(warnings.some((w) => w.includes('blockquote') && w.includes('heading style'))).toBe(true)
    })
})

describe('ordered_list start attribute (not present in test-exporter.md)', () => {
    it('warns rather than silently dropping a non-default start value', async () => {
        const { warnings } = await decode('<ol start="5"><li><p>one</p></li></ol>')
        expect(warnings.length).toBeGreaterThan(0)
        expect(warnings.some((w) => w.includes('start'))).toBe(true)
    })
})

describe('an <li> with two paragraphs (not present in test-exporter.md)', () => {
    it('only the first paragraph carries numPr; the second still gets ListParagraph for alignment', async () => {
        const { xml, warnings } = await decode('<ul><li><p>first</p><p>second</p></li></ul>')
        expect(warnings).toEqual([])
        const paragraphs = xml.match(/<w:p>.*?<\/w:p>/gs)
        expect(paragraphs.length).toBe(2)
        expect(paragraphs[0]).toContain('<w:numPr>')
        expect(paragraphs[1]).not.toContain('<w:numPr>')
        expect(paragraphs[1]).toContain('w:pStyle w:val="ListParagraph"')
    })
})

describe('table class variations, colspan, rowspan, and cell background (test-exporter.md\'s tables carry no class, colspan, rowspan, or cell background)', () => {
    function tblBordersBlock(xml) {
        return xml.match(/<w:tblBorders>.*?<\/w:tblBorders>/s)[0]
    }

    it('bordered-table-none: every side explicitly styled none', async () => {
        const { xml, warnings } = await decode('<table class="bordered-table-none"><tr><td><p>x</p></td></tr></table>')
        expect(warnings).toEqual([])
        const block = tblBordersBlock(xml)
        expect(block).not.toContain('w:val="single"')
        expect(block).toContain('w:val="none"')
    })

    it('bordered-table-outer: outer edges single, inside lines explicitly none', async () => {
        const { xml, warnings } = await decode('<table class="bordered-table-outer"><tr><td><p>x</p></td></tr></table>')
        expect(warnings).toEqual([])
        const block = tblBordersBlock(xml)
        expect(block).toMatch(/<w:top w:val="single"/)
        expect(block).toMatch(/<w:insideH w:val="none"/)
    })

    it('bordered-table-header: outer table border, header th cells get their own border', async () => {
        const html = '<table class="bordered-table-header"><tr><th><p>head</p></th></tr><tr><td><p>data</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(tblBordersBlock(xml)).toMatch(/<w:top w:val="single"/)
        expect(xml).toMatch(/<w:tcPr>[\s\S]*?<w:tcBorders>/)
    })

    it('a colspan header cell carries w:gridSpan with the correct value', async () => {
        const html = '<table><tr><th colspan="2"><p>merged head</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:gridSpan w:val="2"/>')
    })

    it('a rowspan cell produces a real vMerge continuation cell in the next row', async () => {
        const html = '<table><tr><td rowspan="2"><p>tall</p></td><td><p>top</p></td></tr><tr><td><p>bottom</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toMatch(/w:val="restart"/)
        expect(xml).toMatch(/w:val="continue"/)
    })

    it('a cell background color becomes real cell shading', async () => {
        const html = '<table><tr><td style="background-color: rgb(255, 0, 0)"><p>red cell</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toMatch(/<w:shd[^>]*w:fill="FF0000"/)
    })
})

describe('image edge cases (test-exporter.md\'s images always resolve cleanly with real dimensions)', () => {
    const ONE_PIXEL_PNG_BASE64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

    it('skips a data: image with no usable width/height, with a warning, rather than embedding it invisibly', async () => {
        const html = `<p><img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}"></p>`
        const { xml, warnings } = await decode(html)
        expect(warnings.length).toBeGreaterThan(0)
        expect(warnings[0]).toMatch(/no usable width\/height/)
        expect(xml).not.toContain('<w:drawing>')
    })

    it('warns rather than throwing on an unresolved (non-data:) <img> reaching the converter directly', async () => {
        const { warnings } = await decode('<p><img src="not-yet-resolved.png"></p>')
        expect(warnings.length).toBeGreaterThan(0)
        expect(warnings[0]).toMatch(/img/)
    })

    it('an unresolved-image link placeholder (resolveImages\' own fallback) flows through as a real hyperlink', async () => {
        const { xml, rels, warnings } = await decode('<p><a href="missing.png">A missing picture (missing.png)</a></p>')
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:hyperlink')
        expect(rels).toContain('missing.png')
    })
})

describe('malformed table structure (only reachable by constructing the DOM directly, not from real markdown)', () => {
    it('warns on an unexpected direct child of <table>, without throwing', () => {
        const doc = new DOMParser().parseFromString('<table><tr><td><p>real row</p></td></tr></table>', 'text/html')
        const table = doc.querySelector('table')
        table.appendChild(doc.createElement('div'))
        const warnings = []
        expect(() => convertBlock(table, { warnings })).not.toThrow()
        expect(warnings.some((w) => w.includes('expected'))).toBe(true)
    })
})
