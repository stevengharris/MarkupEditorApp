// @vitest-environment jsdom
//
// Imports the real BUILT dist/exporter-epub.js, not src/ -- proving the actual bundled
// artifact the app loads (fflate inlined via @rollup/plugin-commonjs, the "markupeditor"
// specifier rewritten to a relative "./markup-editor.js") behaves correctly, not just its
// pre-bundled sources. The shared vitest config (plugin-kit's pluginVitestConfig, dist: true)
// rebuilds dist/ before this file (or any test file) runs, so it's always current, and
// redirects the relative "./markup-editor.js" import dist carries to the stub imported below
// -- there's no real markup-editor.js file in this repo at that path (the app copies one in
// at runtime).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { decodeEpubBuffer, firstLocalFileHeader } from './helpers/decodeEpub.js'
import { MU } from 'markupeditor-plugin-kit/testing/stub'

const getHTML = vi.fn(() => '<h1>Test</h1><p>hello</p>')
const registerPlugin = vi.fn()
const activeView = vi.fn(() => null)
MU.getHTML = getHTML
MU.registerPlugin = registerPlugin
MU.activeView = activeView

const { epubExporter } = await import('../dist/exporter-epub.js')
// registerPlugin fires once, at module load, above -- capture it now, before any beforeEach
// clears the mock's call history for the per-test assertions below.
const registerPluginCallArgs = registerPlugin.mock.calls[0]

// Mirrors the shape MarkupDocument.seedMetadataBlock produces: a code_block node at
// document position 0 with attrs.language "metadata" and the raw YAML lines as its text.
function fakeMetadataDoc(text) {
    return { state: { doc: { firstChild: { type: { name: 'code_block' }, attrs: { language: 'metadata' }, textContent: text } } } }
}

beforeEach(() => {
    getHTML.mockClear()
    getHTML.mockReturnValue('<h1>Test</h1><p>hello</p>')
    activeView.mockReset()
    activeView.mockReturnValue(null)
})

describe('plugin registration', () => {
    it('registers an EPUB exporter plugin whose run callback is bound to the exporter instance', () => {
        const [plugin, ...rest] = registerPluginCallArgs
        expect(plugin.name).toBe('EPUB')
        expect(plugin.type).toBe('exporter')
        expect(plugin.ext).toBe('epub')
        expect(typeof plugin.run).toBe('function')
        expect(rest).toEqual([])
    })
})

describe('EpubExporter.run(), the full real pipeline (resolveImages -> extractImages -> htmlToXhtml -> zip)', () => {
    it('returns {result, warnings, metadata} with a real, decodable EPUB as base64', async () => {
        const json = await epubExporter.run()
        const envelope = JSON.parse(json)
        expect(getHTML).toHaveBeenCalled()
        expect(envelope.warnings).toEqual([])
        expect(envelope.metadata).toBeNull()
        expect(envelope.result).toBeTruthy()

        const zipBytes = Buffer.from(envelope.result, 'base64')
        const parts = decodeEpubBuffer(zipBytes)
        expect(parts['mimetype']).toBe('application/epub+zip')
        expect(parts['META-INF/container.xml']).toContain('OEBPS/content.opf')
        expect(parts['OEBPS/content.opf']).toContain('<dc:title>Test</dc:title>')
        expect(parts['OEBPS/nav.xhtml']).toContain('epub:type="toc"')
        expect(parts['OEBPS/content.xhtml']).toContain('<p>hello</p>')
        expect(parts['OEBPS/styles.css']).toContain('font-family')
        // Table cells always contain at least one <p> (schema: cell content is "block+") --
        // the browser default paragraph margin stacking with cell padding made every row
        // render much taller than its text needed (observed in a real Apple Books render).
        expect(parts['OEBPS/styles.css']).toMatch(/td p,\s*th p\s*{\s*margin:\s*0;?\s*}/)
    })

    it('mimetype is the first zip entry, stored (not deflated), with no extra field', async () => {
        const json = await epubExporter.run()
        const envelope = JSON.parse(json)
        const zipBytes = Buffer.from(envelope.result, 'base64')
        const header = firstLocalFileHeader(zipBytes)
        expect(header.filename).toBe('mimetype')
        expect(header.compressionMethod).toBe(0)
        expect(header.extraFieldLength).toBe(0)
    })

    it('generates a fresh urn:uuid: identifier and a whole-second dcterms:modified timestamp', async () => {
        const json = await epubExporter.run()
        const { result } = JSON.parse(json)
        const parts = decodeEpubBuffer(Buffer.from(result, 'base64'))
        expect(parts['OEBPS/content.opf']).toMatch(/<dc:identifier id="pub-id">urn:uuid:[0-9a-f-]+<\/dc:identifier>/)
        expect(parts['OEBPS/content.opf']).toMatch(/<meta property="dcterms:modified">\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z<\/meta>/)
    })

    it('an empty document produces a valid, decodable minimal EPUB, no crash', async () => {
        getHTML.mockReturnValue('')
        const json = await epubExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])
        expect(envelope.result).toBeTruthy()

        const parts = decodeEpubBuffer(Buffer.from(envelope.result, 'base64'))
        expect(parts['mimetype']).toBe('application/epub+zip')
        expect(parts['OEBPS/content.opf']).toContain('<dc:title>Untitled Document</dc:title>')
        // No headings at all -- nav falls back to a single whole-document entry.
        expect(parts['OEBPS/nav.xhtml']).toContain('<a href="content.xhtml">Untitled Document</a>')
    })

    it('strips a leading metadata code_block (MarkupDocument.seedMetadataBlock\'s shape) out of the exported body -- it\'s data about the document, not part of it', async () => {
        getHTML.mockReturnValue('<pre><code class="language-metadata">author: Steven G. Harris</code></pre><h1>T</h1><p>hello</p>')
        const json = await epubExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])

        const parts = decodeEpubBuffer(Buffer.from(envelope.result, 'base64'))
        expect(parts['OEBPS/content.xhtml']).not.toContain('Steven G. Harris')
        expect(parts['OEBPS/content.xhtml']).toContain('<p>hello</p>')
    })

    it('converter warnings (e.g. an unhandled tag) flow through to the final envelope', async () => {
        getHTML.mockReturnValue('<h1>T</h1><p>ok</p><foo>unrecognized</foo>')
        const json = await epubExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.result).toBeTruthy() // a partial warning doesn't abort the whole export
        expect(envelope.warnings).toEqual(['unhandled tag <foo>'])
    })

    it('a data: URI image flows through extractImages and becomes a real zip entry, referenced from both the XHTML and the OPF manifest', async () => {
        const onePixelPng =
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        getHTML.mockReturnValue(`<h1>T</h1><p><img src="data:image/png;base64,${onePixelPng}" width="10" height="10"></p>`)

        const json = await epubExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])

        const parts = decodeEpubBuffer(Buffer.from(envelope.result, 'base64'))
        expect(parts['OEBPS/content.xhtml']).toContain('<img src="images/image1.png" alt="" width="10" height="10"/>')
        expect(parts['OEBPS/content.opf']).toContain('<item id="img1" href="images/image1.png" media-type="image/png"/>')
        expect(parts['OEBPS/images/image1.png']).toBeDefined()
    })

    it('builds a nested nav from real headings in the document', async () => {
        getHTML.mockReturnValue('<h1 id="intro">Intro</h1><p>a</p><h2 id="sub">Sub</h2><p>b</p>')
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([])
        const parts = decodeEpubBuffer(Buffer.from(result, 'base64'))
        expect(parts['OEBPS/nav.xhtml']).toContain('<a href="content.xhtml#intro">Intro</a>')
        expect(parts['OEBPS/nav.xhtml']).toContain('<a href="content.xhtml#sub">Sub</a>')
    })

    it('returns a null result with a warning, without throwing, when something upstream fails', async () => {
        getHTML.mockImplementation(() => { throw new Error('boom') })
        const json = await epubExporter.run()
        expect(JSON.parse(json)).toEqual({
            result: null,
            warnings: ['EPUB conversion failed: boom'],
            metadata: null
        })
    })

    it('omits dc:creator when the document has no metadata block', async () => {
        const json = await epubExporter.run()
        const { result } = JSON.parse(json)
        const parts = decodeEpubBuffer(Buffer.from(result, 'base64'))
        expect(parts['OEBPS/content.opf']).not.toContain('dc:creator')
    })

    it('pulls dc:creator from the live document\'s metadata code_block when present, and an explicit title overrides the auto-detected heading', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('creator: Steven G. Harris\ntitle: Something Else'))
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([])
        const parts = decodeEpubBuffer(Buffer.from(result, 'base64'))
        expect(parts['OEBPS/content.opf']).toContain('<dc:creator>Steven G. Harris</dc:creator>')
        // getHTML() still returns the default '<h1>Test</h1>...' -- an explicit frontmatter
        // title must win over it, not just apply when no heading exists at all.
        expect(parts['OEBPS/content.opf']).toContain('<dc:title>Something Else</dc:title>')
        expect(parts['OEBPS/nav.xhtml']).toContain('Something Else')
    })

    it('a differently-cased frontmatter key ("Title:") still overrides the heading, with no stray wrong-cased <dc:Title> from the Dublin Core sweep', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('Title: Something Else'))
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([])
        const opf = decodeEpubBuffer(Buffer.from(result, 'base64'))['OEBPS/content.opf']
        expect(opf).toContain('<dc:title>Something Else</dc:title>')
        expect((opf.match(/<dc:title/gi) || []).length).toBe(1)
    })

    it('a non-Dublin-Core frontmatter key is dropped with a warning instead of emitting a schema-invalid <dc:*> element', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('creator: Steve\ndraft: true\ntags: [a, b]'))
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([
            'metadata field "draft" is not a Dublin Core element, skipped',
            'metadata field "tags" is not a Dublin Core element, skipped',
        ])
        const opf = decodeEpubBuffer(Buffer.from(result, 'base64'))['OEBPS/content.opf']
        expect(opf).toContain('<dc:creator>Steve</dc:creator>')
        expect(opf).not.toMatch(/<dc:(draft|tags)/)
    })

    it('emits one dc:subject per item for a block-sequence subject, and keeps a quoted item\'s comma intact', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('subject:\n  - testing\n  - "a, b"\n  - "#swift"'))
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([])
        const opf = decodeEpubBuffer(Buffer.from(result, 'base64'))['OEBPS/content.opf']
        expect(opf).toContain('<dc:subject>testing</dc:subject>')
        expect(opf).toContain('<dc:subject>a, b</dc:subject>')
        expect(opf).toContain('<dc:subject>#swift</dc:subject>')
    })

    it('does not fail the export when a scalar field is written as a sequence', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('title: [One, Two]\nlanguage: [fr]'))
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([])
        const opf = decodeEpubBuffer(Buffer.from(result, 'base64'))['OEBPS/content.opf']
        expect(opf).toContain('<dc:title>One, Two</dc:title>')
        expect(opf).toContain('<dc:language>fr</dc:language>')
    })

    it('honors an explicit language from metadata instead of the "en" default', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('language: fr'))
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([])
        const parts = decodeEpubBuffer(Buffer.from(result, 'base64'))
        expect(parts['OEBPS/content.opf']).toContain('<dc:language>fr</dc:language>')
    })

    it('wires description/date/subject from metadata into dc:description/dc:date/dc:subject', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('description: A test document\ndate: 2026-01-01\nsubject: [foo, bar]'))
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([])
        const parts = decodeEpubBuffer(Buffer.from(result, 'base64'))
        expect(parts['OEBPS/content.opf']).toContain('<dc:description>A test document</dc:description>')
        expect(parts['OEBPS/content.opf']).toContain('<dc:date>2026-01-01</dc:date>')
        expect(parts['OEBPS/content.opf']).toContain('<dc:subject>foo</dc:subject>')
        expect(parts['OEBPS/content.opf']).toContain('<dc:subject>bar</dc:subject>')
    })

    it('an explicit identifier in metadata replaces the auto-generated urn:uuid:, staying stable across re-exports', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('identifier: urn:isbn:9780000000000'))
        const json = await epubExporter.run()
        const { result, warnings } = JSON.parse(json)
        expect(warnings).toEqual([])
        const parts = decodeEpubBuffer(Buffer.from(result, 'base64'))
        expect(parts['OEBPS/content.opf']).toContain('<dc:identifier id="pub-id">urn:isbn:9780000000000</dc:identifier>')
        expect((parts['OEBPS/content.opf'].match(/<dc:identifier/g) || []).length).toBe(1)
    })

    it('the registered run callback works correctly when called detached from the instance (what MU.runPlugin actually does)', async () => {
        const { run: registeredRun } = registerPluginCallArgs[0]
        const json = await registeredRun()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])
        expect(envelope.result).toBeTruthy()
    })
})
