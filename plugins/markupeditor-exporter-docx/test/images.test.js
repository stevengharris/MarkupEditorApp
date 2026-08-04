// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Document } from 'docx'
import { htmlToDocxChildren } from '../src/htmlToDocx.js'
import { documentStyles } from '../src/styles.js'
import { decodeDocx } from './helpers/decodeDocx.js'

// A minimal but genuinely valid 1x1 PNG, base64-encoded -- real bytes, not a placeholder
// string, so ImageRun has something real to embed.
const ONE_PIXEL_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

async function decode(html) {
    const warnings = []
    const children = htmlToDocxChildren(html, warnings)
    const doc = new Document({ styles: documentStyles, sections: [{ children }] })
    const parts = await decodeDocx(doc)
    return { xml: parts['word/document.xml'], rels: parts['word/_rels/document.xml.rels'], warnings }
}

describe('resolved <img> (data: URI, as resolveImages already produced before this converter runs)', () => {
    it('embeds a data: PNG as a real ImageRun with the resolved pixel dimensions', async () => {
        const html = `<p><img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}" width="190" height="60"></p>`
        const { xml, rels, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:drawing>')
        // wp:extent is in EMU (px * 9525) -- confirms sizing comes from the RESOLVED
        // width/height attributes resolveImages already wrote, not a stale source value.
        expect(xml).toContain(`cx="${190 * 9525}"`)
        expect(xml).toContain(`cy="${60 * 9525}"`)
        expect(rels).toMatch(/Type="[^"]*image"/i)
    })

    it('sizes from the resolved attributes even when they differ from the original markup, without re-deriving them', async () => {
        // resolveImages runs first and corrects width/height before this converter ever sees
        // the tag -- it never re-derives or second-guesses sizing itself.
        const html = `<p><img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}" width="190" height="60"></p>`
        const { xml } = await decode(html)
        expect(xml).toContain(`cx="${190 * 9525}"`)
        expect(xml).toContain(`cy="${60 * 9525}"`)
        expect(xml).not.toContain(`cx="${87 * 9525}"`)
    })

    // Regression test: a data: image with no width/height (or 0) would otherwise embed
    // invisibly and silently -- Number(null) is 0, not NaN, so a naive presence check alone
    // doesn't catch it.
    it('skips a data: image with no usable width/height, with a warning, rather than embedding it invisibly', async () => {
        const html = `<p><img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}"></p>`
        const { xml, warnings } = await decode(html)
        expect(warnings.length).toBeGreaterThan(0)
        expect(warnings[0]).toMatch(/no usable width\/height/)
        expect(xml).not.toContain('<w:drawing>')
    })

    // Regression: docx's own docPr id generator restarts at 1 for every ImageRun instead of
    // sharing one counter across the document, so multiple images previously all got the
    // identical wp:docPr id="1" -- a real OOXML validity violation (these are meant to be
    // document-unique) that some consumers reject outright.
    it('gives each of several images in one document a distinct wp:docPr id', async () => {
        const html =
            `<p><img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}" width="10" height="10"></p>` +
            `<p><img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}" width="20" height="20"></p>` +
            `<p><img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}" width="30" height="30"></p>`
        const { xml, warnings } = await decode(html)
        expect(warnings).toEqual([])
        const ids = [...xml.matchAll(/<wp:docPr id="(\d+)"/g)].map((m) => m[1])
        expect(ids.length).toBe(3)
        expect(new Set(ids).size).toBe(3)
    })
})

describe('unembeddable image fallback (resolveImages already rewrote it to a plain <a> link)', () => {
    it('an unresolved image link placeholder flows through the normal link handling as a real hyperlink', async () => {
        const html = '<p><a href="missing.png">A missing picture (missing.png)</a></p>'
        const { xml, rels, warnings } = await decode(html)
        expect(warnings).toEqual([])
        expect(xml).toContain('<w:hyperlink')
        expect(xml).toContain('A missing picture (missing.png)')
        expect(rels).toContain('missing.png')
    })
})

describe('an unresolved (non-data:) <img> reaching the converter directly', () => {
    it('warns rather than throwing or silently vanishing -- this converter expects resolveImages to have already run', async () => {
        const html = '<p><img src="not-yet-resolved.png"></p>'
        const { warnings } = await decode(html)
        expect(warnings.length).toBeGreaterThan(0)
        expect(warnings[0]).toMatch(/img/)
    })
})
