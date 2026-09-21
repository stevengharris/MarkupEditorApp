import { MU } from "markupeditor"
import { zipSync } from "fflate"
import { resolveImages } from "./resolveImages.js"
import { extractImages } from "./extractImages.js"
import { htmlToXhtmlBody, extractDocumentTitle, extractHeadings } from "./htmlToXhtml.js"
import { buildOpf } from "./opf.js"
import { buildNavXhtml } from "./nav.js"
import { buildContentXhtml } from "./contentDocument.js"
import { extractMetadata, metadataScalar, stripMetadataBlock } from "./metadata.js"
import { CONTAINER_XML } from "./container.js"
import { MIMETYPE } from "./mimetype.js"
import { STYLESHEET } from "./styles.js"

// btoa expects a binary string, not raw bytes -- chunk to stay well under any engine's
// call-stack argument-count limit (a single String.fromCharCode(...spread) over a real
// document-sized buffer overflows it). Same contract as docxexporter.js's
// arrayBufferToBase64, operating on a Uint8Array directly since zipSync already returns one
// (no ArrayBuffer-wrapping step needed).
const CHUNK_SIZE = 0x8000

export class EpubExporter {

    bytesToBase64(bytes) {
        let binary = ''
        for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))
        }
        return btoa(binary)
    }

    // The plugin envelope shape ({result, warnings, metadata}) is a contract with the Swift side
    // (MarkupWKWebView+Extension.swift's runExporter) -- any exporter plugin must return exactly
    // this shape, regardless of which library produced the bytes.
    async run() {
        const warnings = []
        try {
            const rawHtml = stripMetadataBlock(MU.getHTML())
            const resolvedHtml = await resolveImages(rawHtml, warnings)
            const { html: htmlWithImagePaths, images } = extractImages(resolvedHtml, warnings)
            const bodyHtml = htmlToXhtmlBody(htmlWithImagePaths, warnings)
            const headings = extractHeadings(htmlWithImagePaths)
            const metadata = extractMetadata(MU)
            // An explicit `title:` in frontmatter wins over the auto-detected first heading --
            // the heading is a fallback for a document that never set one, not an override of
            // one the author gave. Same idea for identifier: a document that pins `identifier:`
            // gets a STABLE identifier across re-exports instead of a fresh urn:uuid: every time.
            const title = metadataScalar(metadata.title) || extractDocumentTitle(rawHtml)
            const language = metadataScalar(metadata.language) || metadataScalar(metadata.lang) || 'en'
            const identifier = metadataScalar(metadata.identifier) || `urn:uuid:${crypto.randomUUID()}`
            // Truncated to whole seconds ("Z", not ".123Z") -- dcterms:modified's OPF-spec
            // format is CCYY-MM-DDThh:mm:ssZ, no fractional seconds.
            const modified = new Date().toISOString().replace(/\.\d+Z$/, 'Z')

            const encoder = new TextEncoder()
            const zipEntries = {
                // Must be the first key inserted -- zipSync preserves insertion order, and the
                // mimetype entry must be both first and stored (level 0), never deflated, or
                // some reading systems silently refuse the file.
                mimetype: [encoder.encode(MIMETYPE), { level: 0 }],
                'META-INF/container.xml': encoder.encode(CONTAINER_XML),
                'OEBPS/content.opf': encoder.encode(buildOpf({ identifier, title, language, modified, images, metadata, warnings })),
                'OEBPS/nav.xhtml': encoder.encode(buildNavXhtml({ title, headings })),
                'OEBPS/content.xhtml': encoder.encode(buildContentXhtml({ title, bodyHtml })),
                'OEBPS/styles.css': encoder.encode(STYLESHEET),
            }
            for (const image of images) {
                zipEntries[`OEBPS/${image.filename}`] = image.bytes
            }

            const zipBytes = zipSync(zipEntries)
            return JSON.stringify({ result: this.bytesToBase64(zipBytes), warnings, metadata: null })
        } catch (error) {
            warnings.push(`EPUB conversion failed: ${error.message}`)
            return JSON.stringify({ result: null, warnings, metadata: null })
        }
    }
}

export const epubExporter = new EpubExporter()

MU.registerPlugin({ name: 'EPUB', type: 'exporter', filename: 'exporter-epub.js', run: epubExporter.run.bind(epubExporter) }, 'EPUB')
