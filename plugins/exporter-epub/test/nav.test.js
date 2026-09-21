import { describe, it, expect } from 'vitest'
import { buildNavXhtml } from '../src/nav.js'

describe('buildNavXhtml', () => {
    it('falls back to a single entry pointing at the whole content document when there are no headings', () => {
        const xhtml = buildNavXhtml({ title: 'My Doc', headings: [] })
        expect(xhtml).toContain('<a href="content.xhtml">My Doc</a>')
        expect(xhtml).toContain('epub:type="toc"')
    })

    it('builds a flat list for headings all at the same level', () => {
        const headings = [
            { level: 1, id: 'a', text: 'A' },
            { level: 1, id: 'b', text: 'B' },
        ]
        const xhtml = buildNavXhtml({ title: 'Doc', headings })
        expect(xhtml).toContain('<a href="content.xhtml#a">A</a>')
        expect(xhtml).toContain('<a href="content.xhtml#b">B</a>')
        // Flat, sibling <li>s -- no nested <ol> since neither heading is a child of the other.
        expect(xhtml.match(/<ol>/g).length).toBe(1)
    })

    it('nests a deeper heading inside its shallower predecessor', () => {
        const headings = [
            { level: 1, id: 'a', text: 'A' },
            { level: 2, id: 'a1', text: 'A.1' },
        ]
        const xhtml = buildNavXhtml({ title: 'Doc', headings })
        const liA = xhtml.match(/<li><a href="content\.xhtml#a">A<\/a>(.*?)<\/li>/s)[0]
        expect(liA).toContain('<a href="content.xhtml#a1">A.1</a>')
    })

    it('handles a non-monotonic jump (h1 straight to h3) by nesting under the nearest ancestor', () => {
        const headings = [
            { level: 1, id: 'a', text: 'A' },
            { level: 3, id: 'a3', text: 'A.3' },
        ]
        const xhtml = buildNavXhtml({ title: 'Doc', headings })
        const liA = xhtml.match(/<li><a href="content\.xhtml#a">A<\/a>(.*?)<\/li>/s)[0]
        expect(liA).toContain('<a href="content.xhtml#a3">A.3</a>')
    })

    it('returns two siblings back to level 1 after a nested level 2 closes', () => {
        const headings = [
            { level: 1, id: 'a', text: 'A' },
            { level: 2, id: 'a1', text: 'A.1' },
            { level: 1, id: 'b', text: 'B' },
        ]
        const xhtml = buildNavXhtml({ title: 'Doc', headings })
        // B is a top-level sibling of A, not nested under A.1.
        const outerOl = xhtml.match(/<nav[^>]*>.*?<ol>(.*)<\/ol>\s*<\/nav>/s)[1]
        const topLevelLis = outerOl.match(/<li>/g)
        expect(topLevelLis.length).toBeGreaterThanOrEqual(2)
        expect(xhtml).toContain('<a href="content.xhtml#b">B</a>')
    })

    it('escapes a heading title containing XML-special characters', () => {
        const xhtml = buildNavXhtml({ title: 'Doc', headings: [{ level: 1, id: 'a', text: 'A & B' }] })
        expect(xhtml).toContain('<a href="content.xhtml#a">A &amp; B</a>')
    })
})
