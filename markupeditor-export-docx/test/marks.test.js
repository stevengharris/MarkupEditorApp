// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Document } from 'docx'
import { htmlToDocxChildren } from '../src/htmlToDocx.js'
import { documentStyles } from '../src/styles.js'
import { decodeDocx } from './helpers/decodeDocx.js'

async function decode(html) {
    const warnings = []
    const children = htmlToDocxChildren(html, warnings)
    const doc = new Document({ styles: documentStyles, sections: [{ children }] })
    const parts = await decodeDocx(doc)
    return { xml: parts['word/document.xml'], rels: parts['word/_rels/document.xml.rels'], warnings }
}

describe('the 7 non-code marks, each verified against the real decoded run property', () => {
    const cases = [
        { tag: 'strong', html: '<p><strong>bold</strong></p>', expect: /<w:b\/>/ },
        { tag: 'em', html: '<p><em>italic</em></p>', expect: /<w:i\/>/ },
        { tag: 'u', html: '<p><u>underlined</u></p>', expect: /<w:u w:val=/ },
        { tag: 's', html: '<p><s>struck</s></p>', expect: /<w:strike\/>/ },
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
})

describe('marks combine onto a single run', () => {
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
})

describe('a mark spanning a <br>', () => {
    it('keeps the mark on both sides of the break, not just before it', async () => {
        const { xml, warnings } = await decode('<p><strong>before<br>after</strong></p>')
        expect(warnings).toEqual([])
        expect(xml).toContain('before')
        expect(xml).toContain('after')
        expect(xml).toContain('<w:br/>')
        // Three runs total ("before", the break itself, "after"), all bold -- the break run
        // carries the mark too (harmless: a content-less run's formatting is inert, but
        // consistent is simpler than special-casing it away).
        expect((xml.match(/<w:b\/>/g) || []).length).toBe(3)
    })
})

describe('links', () => {
    it('an external link produces a real hyperlink relationship in word/_rels/document.xml.rels, referencing docx\'s built-in Hyperlink style', async () => {
        const { xml, rels, warnings } = await decode('<p><a href="https://example.com">click here</a></p>')
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:hyperlink')
        expect(xml).toContain('click here')
        expect(xml).toContain('w:val="Hyperlink"')
        expect(rels).toBeTruthy()
        expect(rels).toContain('https://example.com')
        expect(rels).toMatch(/Type="[^"]*hyperlink"/i)
    })

    // The link `title` attribute is dropped entirely -- no tooltip/comment generated.
    // Consistent with dropping heading `id`: neither carries forward into a docx-native
    // equivalent that isn't half-wired infrastructure for a feature nothing currently needs.
    it('drops the link title attribute -- no tooltip/comment, by decision', async () => {
        const { xml } = await decode('<p><a href="https://example.com" title="a tooltip">text</a></p>')
        expect(xml).not.toContain('a tooltip')
    })

    // Since headings never emit a bookmark, an internal link has nowhere real to point.
    // Rather than emit a hyperlink to a nonexistent anchor, the link wrapper is dropped and
    // its text renders plainly -- loudly, via a warning, not a silent behavior change.
    it('drops an internal (#id) link to plain text, with a warning, consistent with headings never emitting a bookmark', async () => {
        const { xml, warnings } = await decode('<p><a href="#section-1">jump</a></p>')
        expect(xml).not.toContain('<w:hyperlink')
        expect(xml).toContain('jump')
        expect(warnings.some((w) => w.includes('internal link'))).toBe(true)
    })
})
