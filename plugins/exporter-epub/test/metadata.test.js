import { describe, it, expect } from 'vitest'
import { extractMetadata, metadataScalar, parseMetadataList, stripMetadataBlock } from '../src/metadata.js'

function fakeNode({ typeName = 'code_block', language, text = '' } = {}) {
    return { type: { name: typeName }, attrs: { language }, textContent: text }
}

function fakeMU(firstChild) {
    return { activeView: () => ({ state: { doc: { firstChild } } }) }
}

describe('extractMetadata', () => {
    it('returns {} when there is no active view at all', () => {
        expect(extractMetadata({})).toEqual({})
        expect(extractMetadata({ activeView: () => null })).toEqual({})
    })

    it('returns {} when the document has no leading metadata block', () => {
        const MU = fakeMU(fakeNode({ typeName: 'paragraph' }))
        expect(extractMetadata(MU)).toEqual({})
    })

    it('returns {} when the leading code_block is a different language', () => {
        const MU = fakeMU(fakeNode({ language: 'swift', text: 'let x = 1' }))
        expect(extractMetadata(MU)).toEqual({})
    })

    it('extracts a scalar field from a real metadata code_block', () => {
        const MU = fakeMU(fakeNode({ language: 'metadata', text: 'creator: Steven G. Harris\nsubject: [foo, bar]' }))
        expect(extractMetadata(MU).creator).toBe('Steven G. Harris')
    })

    it('lowercases field names, so a differently-cased key still matches opf.js\'s RESERVED_KEYS exclusion and the title/language/identifier lookups', () => {
        const MU = fakeMU(fakeNode({ language: 'metadata', text: 'Title: Something Else\nLANGUAGE: fr' }))
        expect(extractMetadata(MU)).toEqual({ title: 'Something Else', language: 'fr' })
    })

    it('matches the language check case-insensitively and trims whitespace, mirroring codeview-metadata', () => {
        const MU = fakeMU(fakeNode({ language: ' Metadata ', text: 'author: Steve' }))
        expect(extractMetadata(MU).author).toBe('Steve')
    })

    it('strips matching surrounding quotes from a value', () => {
        const MU = fakeMU(fakeNode({ language: 'metadata', text: 'author: "Steven G. Harris"' }))
        expect(extractMetadata(MU).author).toBe('Steven G. Harris')
    })

    it('skips blank lines, comments, and the closing --- fence', () => {
        const MU = fakeMU(fakeNode({ language: 'metadata', text: 'author: Steve\n\n# a comment\n---' }))
        expect(extractMetadata(MU)).toEqual({ author: 'Steve' })
    })

    it('returns {} for an empty metadata block rather than throwing', () => {
        const MU = fakeMU(fakeNode({ language: 'metadata', text: '' }))
        expect(extractMetadata(MU)).toEqual({})
    })
})

describe('extractMetadata: constructs YAMLMetadata (Swift) reads and writes', () => {
    function parse(text) {
        return extractMetadata({ activeView: () => ({ state: { doc: { firstChild: { type: { name: 'code_block' }, attrs: { language: 'metadata' }, textContent: text } } } }) })
    }

    it('parses a flow sequence into an array', () => {
        expect(parse('subject: [foo, bar]')).toEqual({ subject: ['foo', 'bar'] })
    })

    it('parses a block sequence into an array', () => {
        expect(parse('subject:\n  - foo\n  - bar\ntitle: T')).toEqual({ subject: ['foo', 'bar'], title: 'T' })
    })

    it('skips blank lines inside a block sequence and keeps reading its items', () => {
        expect(parse('subject:\n- foo\n\n- bar')).toEqual({ subject: ['foo', 'bar'] })
    })

    it('leaves an empty value with no following items as an empty string', () => {
        expect(parse('title:\ncreator: Steve')).toEqual({ title: '', creator: 'Steve' })
    })

    it('strips quotes from flow sequence elements, including ones with commas or a leading #', () => {
        expect(parse('subject: ["#swift", "a, b", plain]')).toEqual({ subject: ['#swift', 'a, b', 'plain'] })
    })

    it('strips quotes from block sequence items', () => {
        expect(parse('subject:\n  - "#swift"\n  - \'it\'\'s\'')).toEqual({ subject: ['#swift', "it's"] })
    })

    it('unescapes \\" and \\\\ in a double-quoted scalar', () => {
        expect(parse('title: "say \\"hi\\" \\\\ bye"')).toEqual({ title: 'say "hi" \\ bye' })
    })

    it('unescapes an escaped quote inside a quoted flow element without splitting on a following comma', () => {
        expect(parse('subject: ["a\\", b", c]')).toEqual({ subject: ['a", b', 'c'] })
    })

    it("unescapes '' in a single-quoted scalar", () => {
        expect(parse("title: 'it''s'")).toEqual({ title: "it's" })
    })

    it('treats an apostrophe inside a bare flow element as literal', () => {
        expect(parse("subject: [don't, stop]")).toEqual({ subject: ["don't", 'stop'] })
    })

    it('skips a multi-line scalar indicator instead of reading "|" as the value', () => {
        expect(parse('description: |\ntitle: T')).toEqual({ title: 'T' })
    })

    it('round-trips what YAMLMetadata.serialize writes for values that need quoting', () => {
        const yaml = 'title: "- dashed"\ncreator: "a: b"\nsubject: ["#swift", "[x]", plain, "q\\"uote"]'
        expect(parse(yaml)).toEqual({ title: '- dashed', creator: 'a: b', subject: ['#swift', '[x]', 'plain', 'q"uote'] })
    })
})

describe('parseMetadataList', () => {
    it('returns a sequence value as its items, dropping empty ones', () => {
        expect(parseMetadataList(['foo', '', 'bar'])).toEqual(['foo', 'bar'])
    })

    it('wraps a plain scalar value in a single-element array', () => {
        expect(parseMetadataList('foo')).toEqual(['foo'])
    })

    it('keeps a scalar that merely looks like a list literal', () => {
        expect(parseMetadataList('[foo, bar]')).toEqual(['[foo, bar]'])
    })

    it('returns an empty array for an absent/empty value', () => {
        expect(parseMetadataList(undefined)).toEqual([])
        expect(parseMetadataList('')).toEqual([])
    })
})

describe('metadataScalar', () => {
    it('passes a string through and joins a sequence', () => {
        expect(metadataScalar('Title')).toBe('Title')
        expect(metadataScalar(['a', 'b'])).toBe('a, b')
    })

    it('returns an empty string for an absent value', () => {
        expect(metadataScalar(undefined)).toBe('')
    })
})

describe('stripMetadataBlock', () => {
    it('removes a leading metadata code_block exactly as MarkupDocument.seedMetadataBlock (Swift) produces it', () => {
        const html = '<pre><code class="language-metadata">author: Steven G. Harris\ntags: [foo, bar, baz]</code></pre><h1>Test Document</h1><p>hello</p>'
        expect(stripMetadataBlock(html)).toBe('<h1>Test Document</h1><p>hello</p>')
    })

    it('leaves html with no metadata block untouched', () => {
        const html = '<h1>Test Document</h1><p>hello</p>'
        expect(stripMetadataBlock(html)).toBe(html)
    })

    it('does not touch a non-leading pre/code block with the same class (only strips at position 0)', () => {
        const html = '<p>hello</p><pre><code class="language-metadata">author: Steve</code></pre>'
        expect(stripMetadataBlock(html)).toBe(html)
    })

    it('does not strip a leading code block of a different language', () => {
        const html = '<pre><code class="language-html">not metadata</code></pre><p>hello</p>'
        expect(stripMetadataBlock(html)).toBe(html)
    })

    it('handles null/empty input without throwing', () => {
        expect(stripMetadataBlock(null)).toBe('')
        expect(stripMetadataBlock('')).toBe('')
    })
})
