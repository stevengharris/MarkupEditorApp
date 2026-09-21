// Document-fidelity coverage for the EPUB exporter, driven off ONE real document --
// plugins/exporter-epub/test/fixtures/test-exporter.md (a duplicate, not a shared file, of
// exporter-docx's copy), rendered through the real importMarkdown() path and exported through
// the real EPUB plugin pipeline (EpubExporter.run(), full: resolveImages -> extractImages ->
// htmlToXhtmlBody -> opf/nav/content documents -> zip) -- rather than many small hand-crafted
// HTML snippets.
//
// Behaviors test-exporter.md's real content does not exercise (u/sub/sup marks, hard_break,
// multi-line code_block whitespace, blockquote wrapping a code_block/heading, table class
// variations/colspan/rowspan/cell background, an <li> with two paragraphs, unresolved/
// undersized image handling, malformed table structure, non-monotonic heading nesting) stay
// covered as targeted synthetic-snippet cases in htmlToXhtml.test.js/nav.test.js, which already
// exist for exactly this kind of internal/dispatch coverage.
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MU } from 'markupeditor'
import { renderTestDocument } from './helpers/renderTestDocument.js'
import { decodeEpubBuffer, firstLocalFileHeader } from './helpers/decodeEpub.js'

// A minimal but genuinely valid 1x1 PNG, base64-encoded -- resolveImages is mocked wholesale
// below: the unmocked Image/canvas path hangs indefinitely in this environment (no real
// browser image decoder), and real image-loading fidelity is verified manually, unchanged
// from exporter-docx's fidelity test. The mock only needs to prove the
// extraction/placement/attribute-rewriting logic downstream of loading, which the document's
// width/height attributes already drive.
const FIXTURE_IMAGE_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

vi.mock('../src/resolveImages.js', () => ({
    resolveImages: async (html) =>
        html.replace(/(<img\b[^>]*\bsrc\s*=\s*)["'][^"']+["']/gi, `$1"data:image/png;base64,${FIXTURE_IMAGE_BASE64}"`),
}))

// epubexporter.js's `import { MU } from "markupeditor"` resolves to the same real, aliased MU
// object imported above (registerPlugin() below is a real, harmless registry write, not
// mocked) -- no separate 'markupeditor' mock. A vi.mock('markupeditor', ...) here would
// replace the module for the whole graph reachable from this test file, including
// markdown.js's MU import (via renderTestDocument.js) -- losing MU.schema/activeView, which
// renderTestDocument.js needs to be real.
const { epubExporter } = await import('../src/epubexporter.js')

let parts, zipBytes, exportWarnings

beforeAll(async () => {
    const md = readFileSync(path.resolve(import.meta.dirname, 'fixtures/test-exporter.md'), 'utf8')
    const rendered = renderTestDocument(md)
    expect(rendered.warnings).toEqual([])

    // epubExporter.run() reads MU.getHTML() and MU.activeView() internally -- monkey-patched
    // the same way renderTestDocument.js patches MU.activeView() for the import step, not a
    // separate mock module. renderTestDocument.js only returns the fixture's raw YAML text
    // (rendered.metadata) since importMarkdown() strips frontmatter out of the HTML rather than
    // seeding it into the doc -- that seeding is Swift-side (MarkupDocument.seedMetadataBlock),
    // outside this harness's reach, so both the doc-model node AND the leading
    // <pre><code class="language-metadata"> HTML it produces are faked here, matching
    // MarkupDocument.seedMetadataBlock's exact escaping (& first, then </>) so this test would
    // have caught the real bug: getHTML() leaking the metadata block into exported body content.
    const escapedMetadata = (rendered.metadata ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const htmlWithSeededMetadata = rendered.metadata
        ? `<pre><code class="language-metadata">${escapedMetadata}</code></pre>${rendered.html}`
        : rendered.html
    const originalGetHTML = MU.getHTML
    const originalActiveView = MU.activeView
    MU.getHTML = () => htmlWithSeededMetadata
    MU.activeView = () => ({
        state: {
            doc: {
                firstChild: rendered.metadata
                    ? { type: { name: 'code_block' }, attrs: { language: 'metadata' }, textContent: rendered.metadata }
                    : null,
            },
        },
    })

    let envelope
    try {
        envelope = JSON.parse(await epubExporter.run())
    } finally {
        MU.getHTML = originalGetHTML
        MU.activeView = originalActiveView
    }
    exportWarnings = envelope.warnings
    zipBytes = Buffer.from(envelope.result, 'base64')
    parts = decodeEpubBuffer(zipBytes)
})

describe('package structure', () => {
    it('mimetype is first, stored, application/epub+zip', () => {
        const header = firstLocalFileHeader(zipBytes)
        expect(header.filename).toBe('mimetype')
        expect(header.compressionMethod).toBe(0)
        expect(parts['mimetype']).toBe('application/epub+zip')
    })

    it('container.xml points at the OPF package document', () => {
        expect(parts['META-INF/container.xml']).toContain('full-path="OEBPS/content.opf"')
    })

    it('the OPF manifests nav, content, styles, and every embedded image', () => {
        const opf = parts['OEBPS/content.opf']
        expect(opf).toContain('properties="nav"')
        expect(opf).toContain('href="content.xhtml"')
        expect(opf).toContain('href="styles.css"')
        expect(opf).toMatch(/<dc:identifier id="pub-id">urn:uuid:/)
        // Deliberately different from the document body's H1 ("Test Document") -- proves the
        // frontmatter title overrides rather than coincidentally matches.
        expect(opf).toContain('<dc:title>MarkupEditor Fidelity Testing</dc:title>')
    })

    it('pulls creator/description/subject/language/date from the fixture\'s real frontmatter', () => {
        const opf = parts['OEBPS/content.opf']
        expect(opf).toContain('<dc:creator>Steven G. Harris</dc:creator>')
        expect(opf).toContain('<dc:description>A baseline test document exercising every element the MarkupEditor supports.</dc:description>')
        expect(opf).toContain('<dc:subject>MarkupEditor</dc:subject>')
        expect(opf).toContain('<dc:subject>testing</dc:subject>')
        expect(opf).toContain('<dc:subject>fidelity</dc:subject>')
        expect(opf).toContain('<dc:language>en-US</dc:language>')
        expect(opf).toContain('<dc:date>2026-09-17</dc:date>')
    })

    it('does not leak the metadata block into the visible body -- it is data about the document, not part of it', () => {
        expect(parts['OEBPS/content.xhtml']).not.toContain('Steven G. Harris')
        expect(parts['OEBPS/content.xhtml']).not.toContain('language-metadata')
    })
})

describe('headings H1-H6', () => {
    it('renders every level with its text, real tags, and no unhandled-tag warnings', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toContain('<h1')
        expect(xhtml).toContain('Test Document') // the document body's H1 text (frontmatter's `title` is deliberately different -- see the metadata describe block above)
        expect(xhtml).toContain('H1 Style')
        for (let level = 2; level <= 6; level++) {
            expect(xhtml).toContain(`<h${level}`)
            expect(xhtml).toContain(`H${level} Style`)
        }
        expect(exportWarnings).toEqual([])
    })
})

describe('code block', () => {
    it('renders the fenced ```html block as a real <pre><code>, language class dropped by the real pipeline\'s HTML (not this converter)', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toContain('<pre><code')
        expect(xhtml).toContain('Code Style')
    })
})

describe('marks', () => {
    it('bold/italic/code/strikethrough map to real XHTML inline elements', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toContain('<strong>Bold text</strong>')
        expect(xhtml).toContain('<em>Italic text</em>')
        expect(xhtml).toContain('<code>Code text</code>')
        expect(xhtml).toContain('<s>Strikethrough text</s>')
    })
})

describe('links', () => {
    it('the external link keeps a real, working href', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toContain('<a href="https://foo.com">link</a>')
    })

    it('the internal (#test-document) link RESOLVES for real -- a genuine fidelity win over DOCX, which drops it', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        const hrefMatch = xhtml.match(/<a href="#([^"]+)">link<\/a>/)
        expect(hrefMatch).not.toBeNull()
        const targetId = hrefMatch[1]
        // The link's target id must actually exist on some heading in the same document --
        // proving this is a real, resolvable anchor, not just a preserved-looking string.
        expect(xhtml).toContain(`id="${targetId}"`)
    })
})

describe('images: local, remote, in-table-cell, and blockquote-indented', () => {
    it('embeds all four images as real zip entries with distinct filenames', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        const imgTags = xhtml.match(/<img [^>]*\/>/g) || []
        expect(imgTags.length).toBe(4)
        const srcs = imgTags.map((tag) => tag.match(/src="([^"]+)"/)[1])
        expect(new Set(srcs).size).toBe(4) // one zip entry per occurrence, not de-duplicated
        for (const src of srcs) {
            expect(parts[`OEBPS/${src}`]).toBeDefined()
        }
    })

    it('sizes the local, in-cell, and blockquote images (144x144) and the remote image (128x128) from their real width/height attributes', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect((xhtml.match(/width="144" height="144"/g) || []).length).toBe(3)
        expect((xhtml.match(/width="128" height="128"/g) || []).length).toBe(1)
    })

    it('every embedded image has a manifest entry with a real image media-type', () => {
        const opf = parts['OEBPS/content.opf']
        expect((opf.match(/media-type="image\/png"/g) || []).length).toBe(4)
    })

    it('the indented image sits inside a real <blockquote>, not a plain paragraph', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        const blockquoteBlock = xhtml.match(/<blockquote>(?:(?!<\/blockquote>).)*?<img[^>]*\/>(?:(?!<\/blockquote>).)*?<\/blockquote>/s)
        expect(blockquoteBlock).not.toBeNull()
    })

    it('the in-cell image sits inside a real <td>, not stripped out (GFM tables allow inline images, unlike block content)', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        const cellBlock = xhtml.match(/<td[^>]*>(?:(?!<\/td>).)*?<img[^>]*\/>(?:(?!<\/td>).)*?<\/td>/s)
        expect(cellBlock).not.toBeNull()
    })
})

describe('tables', () => {
    it('renders a single real 3-column <table>, header and data cells alike', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect((xhtml.match(/<table/g) || []).length).toBe(1)
        expect(xhtml).toContain('A table with a header')
        expect(xhtml).toContain('Left justified')
        expect(xhtml).toContain('and right justified')
    })

    it('preserves column alignment as a real inline style on th/td (GFM :---: maps to text-align: center)', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect((xhtml.match(/style="text-align: center;"/g) || []).length).toBe(4) // header + 3 data rows, middle column only
    })

    it('preserves inline marks inside a cell (bold + italic in the same cell, not flattened)', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toContain('<td><p><strong>formatted</strong> <em>text.</em></p></td>')
    })

    it('a table row is real XHTML tr/td, wrapped in the parser-inserted tbody, not dropped or malformed', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toMatch(/<table><tbody>(?:(?!<\/tbody>).)*<\/tbody><\/table>/s)
    })
})

describe('nested lists', () => {
    it('bulleted > bulleted > numbered renders as real nested <ul>/<ol> (no numbering-instance bookkeeping needed, unlike DOCX)', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toContain('A bulleted list')
        expect(xhtml).toContain('with a sublist')
        expect(xhtml).toContain('and a numbered')
        expect(xhtml).toContain('sublist within it.')
        expect(xhtml).toMatch(/<ul>(?:(?!<\/ul>).)*<ul>(?:(?!<\/ul>).)*<ol>/s)
    })

    it('numbered > numbered > bulleted renders correctly too', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toContain('A numbered list')
        expect(xhtml).toContain('and a bulleted')
    })
})

describe('nested blockquotes', () => {
    it('a doubly-indented paragraph is a real nested <blockquote><blockquote>, no depth-clamped style-family needed (unlike DOCX)', () => {
        const xhtml = parts['OEBPS/content.xhtml']
        expect(xhtml).toContain('An indented (aka quoted) paragraph.')
        expect(xhtml).toContain('A doubly-indented paragraph.')
        expect(xhtml).toMatch(/<blockquote>(?:(?!<\/blockquote>).)*?<blockquote>(?:(?!<\/blockquote>).)*?A doubly-indented paragraph\./s)
    })
})

describe('horizontal rule', () => {
    it('renders a real self-closed <hr/>', () => {
        expect(parts['OEBPS/content.xhtml']).toContain('<hr/>')
    })
})

describe('overall warnings', () => {
    it('the real document exports with zero converter warnings', () => {
        expect(exportWarnings).toEqual([])
    })
})
