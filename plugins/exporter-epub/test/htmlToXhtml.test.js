// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { htmlToXhtmlBody, extractDocumentTitle, extractHeadings } from '../src/htmlToXhtml.js'

// Tag inventory from markupeditor-base/src/schema/index.js, verified empirically against
// exporter-docx's equivalent dispatch-completeness test in htmlToDocx.test.js. Every tag gets
// a REAL handler here (unlike DOCX's li/tr/td/th "recognized but not yet converted"
// placeholders) since XHTML represents all of them natively.
describe('htmlToXhtmlBody dispatch completeness', () => {
    const cases = [
        ['<p>text</p>', '<p>text</p>'],
        ['<blockquote><p>q</p></blockquote>', '<blockquote><p>q</p></blockquote>'],
        ['<h1>H1</h1>', '<h1>H1</h1>'],
        ['<h2>H2</h2>', '<h2>H2</h2>'],
        ['<h3>H3</h3>', '<h3>H3</h3>'],
        ['<h4>H4</h4>', '<h4>H4</h4>'],
        ['<h5>H5</h5>', '<h5>H5</h5>'],
        ['<h6>H6</h6>', '<h6>H6</h6>'],
        ['<ul><li><p>x</p></li></ul>', '<ul><li><p>x</p></li></ul>'],
        ['<ol><li><p>x</p></li></ol>', '<ol><li><p>x</p></li></ol>'],
        // The HTML parser auto-inserts a <tbody> around bare <tr> children on every parse
        // (confirmed empirically, same as htmlToDocx.js's tableRows() comment) -- this
        // asserts the round-trip preserves it rather than assuming it away.
        ['<table><tr><td><p>x</p></td></tr></table>', '<table><tbody><tr><td><p>x</p></td></tr></tbody></table>'],
        ['<div><p>x</p></div>', '<div><p>x</p></div>'],
        ['<hr>', '<hr/>'],
        ['<pre><code>x</code></pre>', '<pre><code>x</code></pre>'],
    ]
    for (const [html, expected] of cases) {
        it(`converts ${html}`, () => {
            const warnings = []
            expect(htmlToXhtmlBody(html, warnings)).toBe(expected)
            expect(warnings).toEqual([])
        })
    }

    it('warns loudly on a genuinely unrecognized tag, without throwing or silently dropping it', () => {
        const warnings = []
        expect(() => htmlToXhtmlBody('<foo>bar</foo>', warnings)).not.toThrow()
        expect(warnings).toEqual(['unhandled tag <foo>'])
    })

    it('drops <button> entirely with no warning (explicit decision, matches htmlToDocx.js)', () => {
        const warnings = []
        expect(htmlToXhtmlBody('<button type="button">Click</button>', warnings)).toBe('')
        expect(warnings).toEqual([])
    })
})

describe('void elements self-close (XHTML well-formedness, unlike loose HTML)', () => {
    it('<br> becomes <br/>', () => {
        const warnings = []
        expect(htmlToXhtmlBody('<p>a<br>b</p>', warnings)).toBe('<p>a<br/>b</p>')
        expect(warnings).toEqual([])
    })

    it('<hr> becomes <hr/>', () => {
        expect(htmlToXhtmlBody('<hr>')).toBe('<hr/>')
    })

    it('a resolved <img> becomes a self-closed void element with required alt', () => {
        const warnings = []
        const html = '<img src="images/image1.png" width="10" height="8">'
        expect(htmlToXhtmlBody(html, warnings)).toBe('<img src="images/image1.png" alt="" width="10" height="8"/>')
        expect(warnings).toEqual([])
    })
})

describe('entity escaping (XML requires it; loose HTML tolerates unescaped & in text)', () => {
    it('escapes & < > in text content', () => {
        // The HTML parser decodes &lt;/&gt; into literal < > characters in the text node (a
        // bare "&" with no matching entity name stays literal) -- this asserts the converter
        // re-escapes both back to valid XML on the way out.
        expect(htmlToXhtmlBody('<p>a & b &lt;tag&gt;</p>')).toBe('<p>a &amp; b &lt;tag&gt;</p>')
    })

    it('escapes special characters in attribute values', () => {
        // The parser decodes &quot; in the source attribute value to a literal " character
        // (same entity-decoding as text content) -- this asserts the converter re-escapes it
        // on the way out, a single round-trip, not a double-escape.
        const html = '<a href="https://example.com/?a=1&b=2" title="a &quot;quote&quot;">link</a>'
        const result = htmlToXhtmlBody(`<p>${html}</p>`)
        expect(result).toContain('href="https://example.com/?a=1&amp;b=2"')
        expect(result).toContain('title="a &quot;quote&quot;"')
    })
})

describe('marks map directly to real XHTML inline elements (no flat-run translation needed, unlike OOXML)', () => {
    it('nests marks naturally, no combining/flattening needed', () => {
        const result = htmlToXhtmlBody('<p><strong><em><u>all three</u></em></strong></p>')
        expect(result).toBe('<p><strong><em><u>all three</u></em></strong></p>')
    })

    for (const tag of ['strong', 'em', 'u', 's', 'sub', 'sup']) {
        it(`<${tag}> passes through unchanged`, () => {
            expect(htmlToXhtmlBody(`<p><${tag}>x</${tag}></p>`)).toBe(`<p><${tag}>x</${tag}></p>`)
        })
    }

    it('inline <code> passes through unchanged', () => {
        expect(htmlToXhtmlBody('<p><code>x</code></p>')).toBe('<p><code>x</code></p>')
    })
})

describe('code_block whitespace preservation (significant, unlike generic recursion)', () => {
    it('preserves multi-line whitespace and indentation exactly', () => {
        const code = '  let x = 1\n    let y = 2\n  let z = 3'
        const warnings = []
        const result = htmlToXhtmlBody(`<pre><code>${code}</code></pre>`, warnings)
        expect(warnings).toEqual([])
        expect(result).toBe(`<pre><code>${code}</code></pre>`)
    })

    it('keeps the language-X class as a highlighter hook (unlike DOCX, which has nowhere to hang it)', () => {
        const result = htmlToXhtmlBody('<pre><code class="language-swift">let x = 1</code></pre>')
        expect(result).toBe('<pre><code class="language-swift">let x = 1</code></pre>')
    })

    it('escapes & < > inside code text', () => {
        const result = htmlToXhtmlBody('<pre><code>if (a < b && b > c) {}</code></pre>')
        expect(result).toBe('<pre><code>if (a &lt; b &amp;&amp; b &gt; c) {}</code></pre>')
    })
})

describe('heading id / internal links (real fidelity win over DOCX, which drops both)', () => {
    it('preserves the heading id attribute', () => {
        const warnings = []
        const result = htmlToXhtmlBody('<h2 id="section-1">Title text</h2>', warnings)
        expect(warnings).toEqual([])
        expect(result).toBe('<h2 id="section-1">Title text</h2>')
    })

    it('an internal link keeps its real, resolvable href', () => {
        const result = htmlToXhtmlBody('<p><a href="#section-1">back</a></p>')
        expect(result).toBe('<p><a href="#section-1">back</a></p>')
    })

    it('keeps the link title attribute (dropped by DOCX, valid in XHTML)', () => {
        const result = htmlToXhtmlBody('<p><a href="https://example.com" title="a tooltip">text</a></p>')
        expect(result).toContain('title="a tooltip"')
    })
})

describe('ordered_list start attribute is honored (warned-about-but-ignored in DOCX)', () => {
    it('keeps a non-default start value', () => {
        const warnings = []
        const result = htmlToXhtmlBody('<ol start="5"><li><p>one</p></li></ol>', warnings)
        expect(warnings).toEqual([])
        expect(result).toBe('<ol start="5"><li><p>one</p></li></ol>')
    })
})

describe('table class, colspan, rowspan, and cell style pass through as real attributes', () => {
    it('keeps the table class for the stylesheet to key off of', () => {
        const result = htmlToXhtmlBody('<table class="bordered-table-none"><tr><td><p>x</p></td></tr></table>')
        expect(result).toContain('<table class="bordered-table-none">')
    })

    it('keeps colspan/rowspan on td/th', () => {
        const result = htmlToXhtmlBody('<table><tr><th colspan="2" rowspan="3"><p>h</p></th></tr></table>')
        expect(result).toContain('<th colspan="2" rowspan="3">')
    })

    it('keeps a cell background-color style', () => {
        const result = htmlToXhtmlBody('<table><tr><td style="background-color: rgb(255, 0, 0)"><p>x</p></td></tr></table>')
        expect(result).toContain('style="background-color: rgb(255, 0, 0)"')
    })

    it('passes thead/tbody/tfoot through directly (no unwrapping needed, unlike htmlToDocx.js)', () => {
        const html = '<table><thead><tr><th><p>h</p></th></tr></thead><tbody><tr><td><p>d</p></td></tr></tbody></table>'
        const warnings = []
        const result = htmlToXhtmlBody(html, warnings)
        expect(warnings).toEqual([])
        expect(result).toBe(html)
    })
})

describe('image edge cases', () => {
    it('warns rather than throwing on an unresolved (non-images/) <img> reaching the converter directly', () => {
        const warnings = []
        htmlToXhtmlBody('<p><img src="not-yet-resolved.png"></p>', warnings)
        expect(warnings.length).toBeGreaterThan(0)
        expect(warnings[0]).toMatch(/unresolved src/)
    })

    it('an unresolved-image link placeholder (resolveImages\' fallback) flows through as a real hyperlink', () => {
        const warnings = []
        const result = htmlToXhtmlBody('<p><a href="missing.png">A missing picture (missing.png)</a></p>', warnings)
        expect(warnings).toEqual([])
        expect(result).toBe('<p><a href="missing.png">A missing picture (missing.png)</a></p>')
    })
})

describe('extractDocumentTitle', () => {
    it('uses the first h1\'s text', () => {
        expect(extractDocumentTitle('<h1>My Doc</h1><h1>Second</h1>')).toBe('My Doc')
    })

    it('falls back to a default when there is no h1', () => {
        expect(extractDocumentTitle('<p>no heading</p>')).toBe('Untitled Document')
    })

    it('trims whitespace', () => {
        expect(extractDocumentTitle('<h1>  Spaced  </h1>')).toBe('Spaced')
    })
})

describe('extractHeadings', () => {
    it('collects every id-bearing heading with its level and text', () => {
        const html = '<h1 id="a">A</h1><p>x</p><h2 id="b">B</h2><h3 id="c">C</h3>'
        expect(extractHeadings(html)).toEqual([
            { level: 1, id: 'a', text: 'A' },
            { level: 2, id: 'b', text: 'B' },
            { level: 3, id: 'c', text: 'C' },
        ])
    })

    it('skips headings with no id -- they render but cannot be a nav target', () => {
        const html = '<h1>no id</h1><h2 id="b">B</h2>'
        expect(extractHeadings(html)).toEqual([{ level: 2, id: 'b', text: 'B' }])
    })

    it('returns an empty array when there are no headings at all', () => {
        expect(extractHeadings('<p>just text</p>')).toEqual([])
    })
})
