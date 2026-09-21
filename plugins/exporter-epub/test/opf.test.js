import { describe, it, expect } from 'vitest'
import { buildOpf } from '../src/opf.js'

const BASE = { identifier: 'urn:uuid:abc-123', title: 'My Title', modified: '2026-09-17T12:00:00Z' }

describe('buildOpf', () => {
    it('includes EPUB3-required metadata: dc:identifier/title/language and dcterms:modified', () => {
        const xml = buildOpf(BASE)
        expect(xml).toContain('<dc:identifier id="pub-id">urn:uuid:abc-123</dc:identifier>')
        expect(xml).toContain('<dc:title>My Title</dc:title>')
        expect(xml).toContain('<dc:language>en</dc:language>')
        expect(xml).toContain('<meta property="dcterms:modified">2026-09-17T12:00:00Z</meta>')
    })

    it('defaults language to "en" but honors an explicit override', () => {
        expect(buildOpf(BASE)).toContain('<dc:language>en</dc:language>')
        expect(buildOpf({ ...BASE, language: 'fr' })).toContain('<dc:language>fr</dc:language>')
    })

    it('always manifests nav.xhtml with properties="nav" and content.xhtml, and spines content only', () => {
        const xml = buildOpf(BASE)
        expect(xml).toContain('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>')
        expect(xml).toContain('<item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>')
        expect(xml).toContain('<item id="css" href="styles.css" media-type="text/css"/>')
        expect(xml).toContain('<itemref idref="content"/>')
    })

    it('adds one manifest item per image, in order, with real media types', () => {
        const images = [
            { filename: 'images/image1.png', mediaType: 'image/png' },
            { filename: 'images/image2.jpg', mediaType: 'image/jpeg' },
        ]
        const xml = buildOpf({ ...BASE, images })
        expect(xml).toContain('<item id="img1" href="images/image1.png" media-type="image/png"/>')
        expect(xml).toContain('<item id="img2" href="images/image2.jpg" media-type="image/jpeg"/>')
    })

    it('escapes a title containing XML-special characters', () => {
        const xml = buildOpf({ ...BASE, title: 'A & B <Test>' })
        expect(xml).toContain('<dc:title>A &amp; B &lt;Test&gt;</dc:title>')
    })

    it('produces well-formed XML with no images (no dangling empty lines/tags)', () => {
        const xml = buildOpf({ ...BASE, images: [] })
        expect(xml).toContain('<manifest>')
        expect(xml).not.toContain('undefined')
    })

    it('emits no extra dc: elements when metadata is empty/absent', () => {
        expect(buildOpf(BASE)).not.toContain('dc:creator')
        expect(buildOpf({ ...BASE, metadata: {} })).not.toContain('dc:creator')
    })

    describe('metadata -> Dublin Core elements', () => {
        it('prefixes a Dublin Core field name with dc: automatically', () => {
            const xml = buildOpf({ ...BASE, metadata: { creator: 'A & B' } })
            expect(xml).toContain('<dc:creator>A &amp; B</dc:creator>')
        })

        it('skips a dc:-prefixed field with a warning, like any other name outside the allowlist', () => {
            const warnings = []
            const xml = buildOpf({ ...BASE, metadata: { 'dc:creator': 'Steve' }, warnings })
            expect(xml).not.toContain('Steve')
            expect(warnings).toEqual(['metadata field "dc:creator" is not a Dublin Core element, skipped'])
        })

        it('emits one element per bracketed-list item, in order', () => {
            const xml = buildOpf({ ...BASE, metadata: { subject: ['foo', 'bar', 'A & B'] } })
            expect(xml).toContain('<dc:subject>foo</dc:subject>')
            expect(xml).toContain('<dc:subject>bar</dc:subject>')
            expect(xml).toContain('<dc:subject>A &amp; B</dc:subject>')
        })

        it('handles description and date the same way, with no per-field code', () => {
            const xml = buildOpf({ ...BASE, metadata: { description: 'A & B', date: '2026-01-01' } })
            expect(xml).toContain('<dc:description>A &amp; B</dc:description>')
            expect(xml).toContain('<dc:date>2026-01-01</dc:date>')
        })

        it('excludes title/language/lang from the Dublin Core sweep -- already emitted via their defaulting logic, not duplicated', () => {
            const xml = buildOpf({ ...BASE, language: 'fr', metadata: { title: 'Other Title', language: 'de', lang: 'es' } })
            expect((xml.match(/<dc:title>/g) || []).length).toBe(1)
            expect((xml.match(/<dc:language>/g) || []).length).toBe(1)
            expect(xml).not.toContain('Other Title')
            expect(xml).toContain('<dc:language>fr</dc:language>')
        })

        it('excludes the bare "identifier" key from the Dublin Core sweep -- the resolved identifier is emitted once, by the caller', () => {
            const xml = buildOpf({ ...BASE, identifier: 'urn:uuid:resolved', metadata: { identifier: 'urn:uuid:ignored' } })
            expect((xml.match(/<dc:identifier/g) || []).length).toBe(1)
            expect(xml).toContain('urn:uuid:resolved')
        })

        it('skips a field that is not a Dublin Core element, and warns, since the OPF schema rejects unknown dc: elements', () => {
            const warnings = []
            const xml = buildOpf({ ...BASE, metadata: { draft: 'true', author: 'Someone', tags: ['a', 'b'] }, warnings })
            expect(xml).not.toMatch(/<dc:(draft|author|tags)/)
            expect(xml).not.toContain('Someone')
            expect(warnings).toEqual([
                'metadata field "draft" is not a Dublin Core element, skipped',
                'metadata field "author" is not a Dublin Core element, skipped',
                'metadata field "tags" is not a Dublin Core element, skipped',
            ])
        })

        it('skips a field whose name is not a valid XML element name, without emitting malformed XML', () => {
            const warnings = []
            const xml = buildOpf({ ...BASE, metadata: { 'not a valid name!': 'value', 'a><b': 'x' }, warnings })
            expect(xml).not.toContain('value')
            expect(xml).not.toContain('a><b')
            expect(warnings).toHaveLength(2)
        })

        it('emits every permitted Dublin Core element', () => {
            const names = ['contributor', 'coverage', 'creator', 'date', 'description', 'format', 'publisher', 'relation', 'rights', 'source', 'subject', 'type']
            const xml = buildOpf({ ...BASE, metadata: Object.fromEntries(names.map((n) => [n, `v-${n}`])) })
            for (const n of names) expect(xml).toContain(`<dc:${n}>v-${n}</dc:${n}>`)
        })
    })
})
