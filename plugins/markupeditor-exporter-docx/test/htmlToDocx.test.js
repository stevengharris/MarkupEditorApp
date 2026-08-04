// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest'
import { Document } from 'docx'
import { htmlToDocxChildren, convertBlock } from '../src/htmlToDocx.js'
import { documentStyles } from '../src/styles.js'
import { decodeDocx } from './helpers/decodeDocx.js'

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
