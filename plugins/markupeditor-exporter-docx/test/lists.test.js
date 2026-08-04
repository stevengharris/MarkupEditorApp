// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Document } from 'docx'
import { htmlToDocxChildren } from '../src/htmlToDocx.js'
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
    return { xml: parts['word/document.xml'], numberingXml: parts['word/numbering.xml'], warnings }
}

describe('simple bullet and numbered lists', () => {
    it('gives every list paragraph w:pStyle="ListParagraph" ahead of its w:numPr', async () => {
        const { xml, warnings } = await decode('<ul><li><p>one</p></li><li><p>two</p></li></ul>')
        expect(warnings).toEqual([])
        const paragraphs = xml.match(/<w:p>.*?<\/w:p>/gs)
        expect(paragraphs.length).toBe(2)
        for (const p of paragraphs) {
            const styleIndex = p.indexOf('w:pStyle w:val="ListParagraph"')
            const numPrIndex = p.indexOf('<w:numPr>')
            expect(styleIndex).toBeGreaterThan(-1)
            expect(numPrIndex).toBeGreaterThan(-1)
            expect(styleIndex).toBeLessThan(numPrIndex)
        }
    })

    it('references the decimal family for <ol>, bullet family for <ul>, as two distinct lists in one document', async () => {
        const { xml, numberingXml, warnings } = await decode(
            '<ul><li><p>bulleted</p></li></ul><ol><li><p>numbered</p></li></ol>'
        )
        expect(warnings).toEqual([])
        const numIds = [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1])
        expect(numIds.length).toBe(2)
        expect(numIds[0]).not.toBe(numIds[1]) // two separate top-level lists, two instances

        // Resolve each numId -> abstractNumId -> numFmt in numbering.xml to confirm the
        // families themselves are actually correct (not just "different from each other").
        const abstractIdFor = (numId) => {
            const numBlock = numberingXml.match(new RegExp(`<w:num w:numId="${numId}"[^>]*>.*?</w:num>`, 's'))[0]
            return numBlock.match(/w:abstractNumId w:val="(\d+)"/)[1]
        }
        const formatFor = (abstractId) => {
            const abstractBlock = numberingXml.match(
                new RegExp(`<w:abstractNum w:abstractNumId="${abstractId}"[^>]*>.*?</w:abstractNum>`, 's')
            )[0]
            return abstractBlock.match(/<w:numFmt w:val="([^"]+)"/)[1]
        }
        expect(formatFor(abstractIdFor(numIds[0]))).toBe('bullet')
        expect(formatFor(abstractIdFor(numIds[1]))).toBe('decimal')
    })
})

describe('nested lists', () => {
    it('increments ilvl under the SAME numId for same-format nesting, not a new list', async () => {
        const html = '<ul><li><p>one</p><ul><li><p>nested</p></li></ul></li></ul>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        const ilvl0 = xml.match(/<w:ilvl w:val="0"\/>\s*<w:numId w:val="(\d+)"\/>/)
        const ilvl1 = xml.match(/<w:ilvl w:val="1"\/>\s*<w:numId w:val="(\d+)"\/>/)
        expect(ilvl0).not.toBeNull()
        expect(ilvl1).not.toBeNull()
        expect(ilvl0[1]).toBe(ilvl1[1]) // same numId across levels
    })

    it('starts a genuinely new, independently-counted list instance when nested format DIFFERS from its parent, but at the CORRECT deeper ilvl -- not a peer of the outer list', async () => {
        const html = '<ol><li><p>outer</p><ul><li><p>inner</p></li></ul></li></ol>'
        const { xml, numberingXml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        // Outer at ilvl 0, inner at ilvl 1 -- genuinely nested, not a peer.
        expect(xml).toMatch(/<w:ilvl w:val="0"\/>/)
        expect(xml).toMatch(/<w:ilvl w:val="1"\/>/)
        const numIds = [...xml.matchAll(/<w:numId w:val="(\d+)"\/>/g)].map((m) => m[1])
        expect(numIds[0]).not.toBe(numIds[1]) // still independent instances, so counting doesn't bleed across formats
        expect(numberingXml).toBeTruthy()
    })

    it('covers an <li> containing two paragraphs -- only the first carries numPr', async () => {
        const { xml, warnings } = await decode('<ul><li><p>first</p><p>second</p></li></ul>')
        expect(warnings).toEqual([])
        const paragraphs = xml.match(/<w:p>.*?<\/w:p>/gs)
        expect(paragraphs.length).toBe(2)
        expect(paragraphs[0]).toContain('<w:numPr>')
        expect(paragraphs[0]).toContain('first')
        expect(paragraphs[1]).not.toContain('<w:numPr>')
        expect(paragraphs[1]).toContain('second')
        // Both still carry ListParagraph so the second visually aligns via the style itself.
        expect(paragraphs[1]).toContain('w:pStyle w:val="ListParagraph"')
    })

    it('covers an <li> containing a nested <ul> as trailing block content', async () => {
        const html = '<ul><li><p>first</p><ul><li><p>child</p></li></ul></li></ul>'
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('first')
        expect(xml).toContain('child')
        const paragraphs = xml.match(/<w:p>.*?<\/w:p>/gs)
        expect(paragraphs.length).toBe(2)
    })
})

describe('numbering.xml abstract definitions', () => {
    it('defines both bullet and decimal abstract numbering with strictly increasing per-level indent', async () => {
        const { numberingXml } = await decode('<ul><li><p>x</p></li></ul>')
        expect(numberingXml).toContain('w:numFmt w:val="bullet"')
        expect(numberingXml).toContain('w:numFmt w:val="decimal"')
        const indents = [...numberingXml.matchAll(/<w:ind w:left="(\d+)"/g)].map((m) => Number(m[1]))
        expect(indents.length).toBeGreaterThan(2)
        for (let i = 1; i < 9 && i < indents.length; i++) {
            expect(indents[i]).toBeGreaterThan(indents[i - 1])
        }
    })

    // A numbered sublist nested inside a bulleted item lands at a DEEPER level of the SAME
    // 'decimal' family to get the correct indent (see convertList) -- it must still read as
    // "1./2.", not cycle to "a)/b)" just because of that indent depth.
    it("every level of the decimal family stays plain decimal ('N.'), never cycles to lowerLetter/lowerRoman by depth", async () => {
        const { numberingXml } = await decode('<ol><li><p>x</p></li></ol>')
        const decimalAbstract = numberingXml.match(/<w:abstractNum[^>]*>(?:(?!<w:abstractNum).)*w:numFmt w:val="decimal".*?<\/w:abstractNum>/s)[0]
        const formats = [...decimalAbstract.matchAll(/<w:numFmt w:val="([^"]+)"/g)].map((m) => m[1])
        expect(formats.length).toBeGreaterThan(2)
        expect(formats.every((f) => f === 'decimal')).toBe(true)
    })
})

describe('ordered_list start attribute', () => {
    it('warns rather than silently dropping a non-default start value (checked, not guessed: markupeditor-base\'s ordered_list DOES support order/start via prosemirror-schema-list)', async () => {
        const { warnings } = await decode('<ol start="5"><li><p>one</p></li></ol>')
        expect(warnings.length).toBeGreaterThan(0)
        expect(warnings.some((w) => w.includes('start'))).toBe(true)
    })
})
