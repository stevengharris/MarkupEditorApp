// @vitest-environment jsdom
//
// Imports the real BUILT dist/exporter-docx.js, not src/ -- proving the actual bundled
// artifact the app loads (the "markupeditor" specifier rewritten to a relative
// "./markup-editor.js") behaves correctly, not just its pre-bundled sources. globalSetup
// (vitest.config.js) rebuilds dist/ before this file (or any test file) runs, so it's always
// current. The relative "./markup-editor.js" import dist carries is redirected, via
// vitest.config.js's resolve.alias keyed to that exact resolved path, to the stub below --
// there's no real markup-editor.js file in this repo at that path (the app copies one in at
// runtime).
import { describe, it, expect, vi, beforeEach } from 'vitest'
import JSZip from 'jszip'
import { MU } from './helpers/markup-editor-stub.js'

const getHTML = vi.fn(() => '<p>hello</p>')
const registerPlugin = vi.fn()
const activeView = vi.fn(() => null)
MU.getHTML = getHTML
MU.registerPlugin = registerPlugin
MU.activeView = activeView

const { docXExporter } = await import('../dist/exporter-docx.js')
// registerPlugin fires once, at module load, above -- capture it now, before any beforeEach
// clears the mock's call history for the per-test assertions below.
const registerPluginCallArgs = registerPlugin.mock.calls[0]

function fakeMetadataDoc(text) {
    return { state: { doc: { firstChild: { type: { name: 'code_block' }, attrs: { language: 'metadata' }, textContent: text } } } }
}

beforeEach(() => {
    getHTML.mockClear()
    getHTML.mockReturnValue('<p>hello</p>')
    activeView.mockReset()
    activeView.mockReturnValue(null)
})

describe('DocXExporter.arrayBufferToBase64', () => {
    it('encodes an empty buffer to an empty string', () => {
        expect(docXExporter.arrayBufferToBase64(new ArrayBuffer(0))).toBe('')
    })

    it('encodes known bytes to the expected base64', () => {
        const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
        expect(docXExporter.arrayBufferToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'))
    })

    it('does not stack overflow on a large buffer and round-trips byte-exact', () => {
        const size = 300_000 // well past a naive String.fromCharCode(...spread) argument-count limit
        const bytes = new Uint8Array(size)
        for (let i = 0; i < size; i++) bytes[i] = i % 256
        expect(() => docXExporter.arrayBufferToBase64(bytes.buffer)).not.toThrow()
        const encoded = docXExporter.arrayBufferToBase64(bytes.buffer)
        expect(Buffer.from(encoded, 'base64').equals(Buffer.from(bytes))).toBe(true)
    })
})

describe('plugin registration', () => {
    it('registers a DocX exporter plugin whose run callback is bound to the exporter instance', () => {
        const [plugin, name] = registerPluginCallArgs
        expect(plugin.name).toBe('DocX')
        expect(plugin.type).toBe('exporter')
        expect(plugin.filename).toBe('exporter-docx.js')
        expect(typeof plugin.run).toBe('function')
        expect(name).toBe('DocX')
    })
})

describe('DocXExporter.run(), the full real pipeline (resolveImages -> converter -> Packer)', () => {
    it('returns {result, warnings, metadata} with a real, decodable docx as base64', async () => {
        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(getHTML).toHaveBeenCalled()
        expect(envelope.warnings).toEqual([])
        expect(envelope.metadata).toBeNull()
        expect(envelope.result).toBeTruthy()

        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        const documentXml = await zip.file('word/document.xml').async('string')
        expect(documentXml).toContain('hello')
    })

    it('an empty document produces a valid, decodable minimal docx, no crash', async () => {
        getHTML.mockReturnValue('')
        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])
        expect(envelope.result).toBeTruthy()

        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        expect(await zip.file('word/document.xml').async('string')).toContain('<w:body>')
        expect(await zip.file('word/styles.xml').async('string')).toBeTruthy()
    })

    it('configures a real Letter page size/margins, and a FIXED-layout table\'s grid columns fit within the configured content width (docx\'s library default is A4)', async () => {
        getHTML.mockReturnValue('<table><tr><td><p>a</p></td><td><p>b</p></td></tr></table>')
        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])

        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        const documentXml = await zip.file('word/document.xml').async('string')

        const pgSz = documentXml.match(/<w:pgSz w:w="(\d+)" w:h="(\d+)"/)
        expect(Number(pgSz[1])).toBe(12240) // Letter width, not docx's A4 default
        expect(Number(pgSz[2])).toBe(15840)
        const pgMar = documentXml.match(/<w:pgMar w:top="(\d+)" w:right="(\d+)" w:bottom="(\d+)" w:left="(\d+)"/)
        const [, top, right, bottom, left] = pgMar.map(Number)
        expect([top, right, bottom, left]).toEqual([1440, 1440, 1440, 1440])

        const contentWidth = Number(pgSz[1]) - left - right
        const gridCols = [...documentXml.matchAll(/<w:gridCol w:w="(\d+)"\/>/g)].map((m) => Number(m[1]))
        const tableWidth = gridCols.reduce((sum, w) => sum + w, 0)
        expect(tableWidth).toBeLessThanOrEqual(contentWidth)
    })

    it('converter warnings (e.g. an unhandled tag) flow through to the final envelope', async () => {
        getHTML.mockReturnValue('<p>ok</p><foo>unrecognized</foo>')
        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.result).toBeTruthy() // a partial warning doesn't abort the whole export
        expect(envelope.warnings).toEqual(['unhandled tag <foo>'])
    })

    it('a data: URI image flows through resolveImages untouched and embeds as a real image -- full pipeline, no mocking needed', async () => {
        const onePixelPng =
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='
        getHTML.mockReturnValue(`<p><img src="data:image/png;base64,${onePixelPng}" width="10" height="10"></p>`)

        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])

        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        const documentXml = await zip.file('word/document.xml').async('string')
        expect(documentXml).toContain('<w:drawing>')
    })

    it('strips a leading metadata code_block (MarkupDocument.seedMetadataBlock\'s shape) out of the exported body -- it\'s data about the document, not part of it', async () => {
        getHTML.mockReturnValue('<pre><code class="language-metadata">creator: Steven G. Harris</code></pre><p>hello</p>')
        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])

        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        const documentXml = await zip.file('word/document.xml').async('string')
        expect(documentXml).not.toContain('Steven G. Harris')
        expect(documentXml).toContain('hello')
    })

    it('sets docx core-properties (title, creator, description, keywords) from document metadata', async () => {
        getHTML.mockReturnValue('<p>hello</p>')
        activeView.mockReturnValue(fakeMetadataDoc(
            'creator: Steven G. Harris\ntitle: My Document\ndescription: A test document\nkeywords: [foo, bar, baz]'
        ))

        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])

        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        const coreXml = await zip.file('docProps/core.xml').async('string')
        expect(coreXml).toContain('<dc:title>My Document</dc:title>')
        expect(coreXml).toContain('<dc:creator>Steven G. Harris</dc:creator>')
        expect(coreXml).toContain('<dc:description>A test document</dc:description>')
        expect(coreXml).toContain('foo, bar, baz')
    })

    it('reads block-sequence keywords with quoted items into the keywords core-property', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('keywords:\n  - foo\n  - "#bar"\n  - baz'))
        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])
        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        expect(await zip.file('docProps/core.xml').async('string')).toContain('foo, #bar, baz')
    })

    it('does not fail the export when a scalar field is written as a sequence', async () => {
        activeView.mockReturnValue(fakeMetadataDoc('title: [One, Two]'))
        const envelope = JSON.parse(await docXExporter.run())
        expect(envelope.warnings).toEqual([])
        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        expect(await zip.file('docProps/core.xml').async('string')).toContain('<dc:title>One, Two</dc:title>')
    })

    it('leaves docx\'s core-properties defaults alone for a document with no metadata block', async () => {
        activeView.mockReturnValue(null)
        const json = await docXExporter.run()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])

        const zip = await JSZip.loadAsync(Buffer.from(envelope.result, 'base64'))
        const coreXml = await zip.file('docProps/core.xml').async('string')
        // docx's library default ("Un-named"), not anything this exporter sets -- no
        // metadata block means no title/description/keywords were passed at all.
        expect(coreXml).not.toContain('<dc:title>')
        expect(coreXml).not.toContain('<dc:description>')
        expect(coreXml).toContain('<dc:creator>Un-named</dc:creator>')
    })

    it('returns a null result with a warning, without throwing, when something upstream fails', async () => {
        getHTML.mockImplementation(() => { throw new Error('boom') })
        const json = await docXExporter.run()
        expect(JSON.parse(json)).toEqual({
            result: null,
            warnings: ['DOCX conversion failed: boom'],
            metadata: null
        })
    })

    it('the registered run callback works correctly when called detached from the instance (what MU.runPlugin actually does)', async () => {
        const { run: registeredRun } = registerPluginCallArgs[0]
        const json = await registeredRun()
        const envelope = JSON.parse(json)
        expect(envelope.warnings).toEqual([])
        expect(envelope.result).toBeTruthy()
    })
})
