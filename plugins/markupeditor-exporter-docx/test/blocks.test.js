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
    return { xml: parts['word/document.xml'], warnings }
}

describe('headings', () => {
    it.each([1, 2, 3, 4, 5, 6])('converts <h%i> to a paragraph styled Heading%i', async (level) => {
        const { xml, warnings } = await decode(`<h${level}>Title text</h${level}>`)
        expect(warnings).toEqual([])
        expect(xml).toContain(`<w:pStyle w:val="Heading${level}"/>`)
        expect(xml).toContain('Title text')
    })

    // The heading `id` attribute is dropped entirely -- no docx bookmark generated. The
    // schema carries `id` for intra-document link targets, but wiring that through requires
    // both a BookmarkStart/BookmarkEnd pair here AND resolving <a href="#id"> to reference it
    // in link conversion -- real, coupled work with no current user-facing need for working
    // intra-document links in exported DOCX. Simpler to drop cleanly now than carry a
    // half-wired bookmark that nothing points at.
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

describe('paragraphs', () => {
    it('produces no <w:spacing> no-op boilerplate on any paragraph', async () => {
        const { xml } = await decode('<p>plain</p><h1>heading</h1>')
        expect(xml).not.toContain('<w:spacing')
    })

    // An absent w:pStyle does not reliably resolve to the named "Normal"/"Body" style in
    // Pages, even though OOXML's default-paragraph-style convention says it should.
    it('references the "Body" style explicitly, never leaves pStyle absent/implicit', async () => {
        const { xml, warnings } = await decode('<p>plain text</p>')
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:pStyle w:val="Body"/>')
    })
})

describe('hard_break', () => {
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

describe('horizontal_rule', () => {
    it('converts <hr> to an empty paragraph with a bottom border, using typed border config', async () => {
        const { xml, warnings } = await decode('<hr>')
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:bottom')
        expect(xml).toMatch(/w:val="single"/)
    })
})
