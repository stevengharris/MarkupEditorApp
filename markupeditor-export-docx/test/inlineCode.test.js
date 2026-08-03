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

// SF Mono font plus background shading for inline <code>, matching markup.css's real
// rendering (font-family: 'SF Mono', ...; background-color: #F8F8F8 in light mode).
describe('inline <code>', () => {
    it('gets SF Mono font and F8F8F8 background shading, matching markup.css exactly', async () => {
        const { xml, warnings } = await decode('<p>see <code>inline()</code> here</p>')
        expect(warnings).toEqual([])
        expect(xml).toContain('inline()')
        expect(xml).toMatch(/<w:rFonts[^>]*w:ascii="SF Mono"/)
        expect(xml).toMatch(/<w:shd[^>]*w:fill="F8F8F8"/)
    })

    it('combines with other active marks (bold inline code) onto one run, not nested/duplicated', async () => {
        const { xml, warnings } = await decode('<p><strong><code>bold code</code></strong></p>')
        expect(warnings).toEqual([])
        const run = xml.match(/<w:r>.*?<\/w:r>/s)[0]
        expect(run).toContain('<w:b/>')
        expect(run).toMatch(/w:ascii="SF Mono"/)
        expect(run).toContain('bold code')
        expect((xml.match(/<w:r>/g) || []).length).toBe(1)
    })

    it('never uses an invisible Private Use Area marker character to identify code runs', async () => {
        const { xml } = await decode('<p>see <code>inline()</code> here</p>')
        // Referenced only as an escape sequence, never a literal pasted glyph: a Private Use
        // Area codepoint is invisible in normal display and breaks exact-string matching in
        // source files.
        const privateUseAreaMarker = String.fromCharCode(0xE000)
        expect(xml.includes(privateUseAreaMarker)).toBe(false)
    })
})
