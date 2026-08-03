// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Document } from 'docx'
import { htmlToDocxChildren, convertBlock } from '../src/htmlToDocx.js'
import { documentStyles } from '../src/styles.js'
import { numberingConfig } from '../src/numbering.js'
import { decodeDocx } from './helpers/decodeDocx.js'

async function decode(html) {
    const warnings = []
    const children = htmlToDocxChildren(html, warnings)
    const doc = new Document({
        styles: documentStyles,
        numbering: { config: numberingConfig },
        sections: [{ children }],
    })
    const parts = await decodeDocx(doc)
    return { xml: parts['word/document.xml'], warnings }
}

function tblBordersBlock(xml) {
    return xml.match(/<w:tblBorders>.*?<\/w:tblBorders>/s)[0]
}

describe('table class -> border mapping (real values from markup.css, not guessed)', () => {
    // docx applies its OWN default tblBorders (auto-color, full grid) for any side left
    // unspecified -- confirmed empirically. "No border" therefore has to be expressed as an
    // EXPLICIT w:val="none" on every side, not by omitting the borders option; the
    // <w:tblBorders> element itself is always present.
    it('bordered-table-none: every side explicitly styled none, no visible line anywhere', async () => {
        const { xml, warnings } = await decode('<table class="bordered-table-none"><tr><td><p>x</p></td></tr></table>')
        expect(warnings).toEqual([])
        const block = tblBordersBlock(xml)
        expect(block).not.toContain('w:val="single"')
        expect(block).toContain('w:val="none"')
    })

    it('bordered-table-outer: outer edges styled single, inside lines explicitly none', async () => {
        const { xml, warnings } = await decode('<table class="bordered-table-outer"><tr><td><p>x</p></td></tr></table>')
        expect(warnings).toEqual([])
        const block = tblBordersBlock(xml)
        expect(block).toMatch(/<w:top w:val="single"/)
        expect(block).toMatch(/<w:insideH w:val="none"/)
        expect(block).toMatch(/<w:insideV w:val="none"/)
    })

    it('bordered-table-header: outer table border, header th cells get their own border', async () => {
        const html = '<table class="bordered-table-header"><tr><th><p>head</p></th></tr><tr><td><p>data</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(tblBordersBlock(xml)).toMatch(/<w:top w:val="single"/)
        // A cell-level border block appears somewhere (on the th), distinct from table-level tblBorders.
        expect(xml).toMatch(/<w:tcPr>[\s\S]*?<w:tcBorders>/)
    })

    it('bordered-table-cell (and the no-class default): full grid, outer + inside lines all single', async () => {
        const withClass = await decode('<table class="bordered-table-cell"><tr><td><p>x</p></td></tr></table>')
        const noClass = await decode('<table><tr><td><p>x</p></td></tr></table>')
        for (const { xml, warnings } of [withClass, noClass]) {
            expect(warnings).toEqual([])
            const block = tblBordersBlock(xml)
            expect(block).toMatch(/<w:insideH w:val="single"/)
            expect(block).toMatch(/<w:insideV w:val="single"/)
        }
    })

    // Without an explicit width, docx auto-sizes a table purely to its content, collapsing
    // columns to a couple characters wide instead of spanning the page.
    it('spans the full page width, matching markup.css\'s table { width: 100% }', async () => {
        const { xml, warnings } = await decode('<table><tr><td><p>x</p></td></tr></table>')
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:tblW w:type="pct" w:w="100%"/>')
    })

    // width alone is not enough -- without layout:FIXED and real per-column widths, Word/
    // Pages' AUTOFIT algorithm still shrinks columns to fit content.
    it('uses fixed layout with real, evenly-distributed per-column widths, accounting for colspan', async () => {
        const html = '<table><tr><th colspan="2"><p>head</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:tblLayout w:type="fixed"/>')
        const gridCols = [...xml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]))
        expect(gridCols.length).toBe(2) // 2 real grid columns, even though the header spans both
        expect(gridCols[0]).toBe(gridCols[1]) // evenly distributed
        expect(gridCols[0]).toBeGreaterThan(1000) // a real width, not a content-hugging sliver
    })

    it('never references a named table style -- no w:tblStyle anywhere, for any class', async () => {
        const { xml } = await decode('<table class="bordered-table-cell"><tr><td><p>x</p></td></tr></table>')
        expect(xml).not.toContain('w:tblStyle')
    })
})

describe('colspan, rowspan, and cell background', () => {
    it('a colspan header cell carries w:gridSpan with the correct value', async () => {
        const html = '<table><tr><th colspan="2"><p>merged head</p></th></tr><tr><td><p>a</p></td><td><p>b</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:gridSpan w:val="2"/>')
        expect(xml).toContain('merged head')
    })

    it('a rowspan cell produces a real vMerge continuation cell in the next row (verified via decoded output, not assumed)', async () => {
        const html = '<table><tr><td rowspan="2"><p>tall</p></td><td><p>top</p></td></tr><tr><td><p>bottom</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('tall')
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

describe('cell content recurses through the normal block dispatch', () => {
    it('covers a colspan header + background cell + a cell containing a nested list, all together', async () => {
        const html = `
            <table class="bordered-table-cell">
                <tr><th colspan="2"><p>Header</p></th></tr>
                <tr>
                    <td style="background-color: rgb(0, 255, 0)"><p>colored</p></td>
                    <td><ul><li><p>nested item</p></li></ul></td>
                </tr>
            </table>
        `
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:gridSpan w:val="2"/>')
        expect(xml).toMatch(/<w:shd[^>]*w:fill="00FF00"/)
        expect(xml).toContain('nested item')
        expect(xml).toContain('<w:numPr>') // the nested list still carries real numbering
    })

    it('does not special-case cell content -- a cell with two paragraphs keeps both', async () => {
        const html = '<table><tr><td><p>first</p><p>second</p></td></tr></table>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('first')
        expect(xml).toContain('second')
    })
})

describe('malformed structure', () => {
    // `<table><p>not a row</p></table>` never reaches this code path -- the HTML5 parser
    // foster-parents disallowed table content out of the table before this converter sees it
    // (same class of surprise as tr/td/th outside a table). Constructing the malformed
    // structure directly in the DOM is the only way to exercise this defensive branch. A real
    // <tr> is included alongside the stray element -- docx's Table can't be constructed with
    // zero rows.
    it('warns on an unexpected direct child of <table>, without throwing', () => {
        const doc = new DOMParser().parseFromString('<table><tr><td><p>real row</p></td></tr></table>', 'text/html')
        const table = doc.querySelector('table')
        const stray = doc.createElement('div')
        table.appendChild(stray)
        const warnings = []
        expect(() => convertBlock(table, { warnings })).not.toThrow()
        expect(warnings.some((w) => w.includes('expected'))).toBe(true)
    })
})
