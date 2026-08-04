import { MU } from "markupeditor"
import { Document, Packer } from "docx"
import { resolveImages } from "./resolveImages.js"
import { htmlToDocxChildren, PAGE_WIDTH_TWIPS, PAGE_HEIGHT_TWIPS, PAGE_MARGIN_TWIPS } from "./htmlToDocx.js"
import { documentStyles } from "./styles.js"
import { numberingConfig } from "./numbering.js"

// btoa expects a binary string, not raw bytes -- chunk to stay well under any engine's
// call-stack argument-count limit (a single String.fromCharCode(...spread) over a real
// document-sized buffer overflows it).
const CHUNK_SIZE = 0x8000

export class DocXExporter {

    arrayBufferToBase64(buffer) {
        const bytes = new Uint8Array(buffer)
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
            const html = await resolveImages(MU.getHTML(), warnings)
            const children = htmlToDocxChildren(html, warnings)
            const doc = new Document({
                styles: documentStyles,
                numbering: { config: numberingConfig },
                sections: [{
                    // Explicit Letter page size/margins -- docx's library default is A4, which
                    // the table column-width math in htmlToDocx.js does not assume (see
                    // PAGE_WIDTH_TWIPS/PAGE_MARGIN_TWIPS there). Both must agree.
                    properties: {
                        page: {
                            size: { width: PAGE_WIDTH_TWIPS, height: PAGE_HEIGHT_TWIPS },
                            margin: { top: PAGE_MARGIN_TWIPS, right: PAGE_MARGIN_TWIPS, bottom: PAGE_MARGIN_TWIPS, left: PAGE_MARGIN_TWIPS },
                        },
                    },
                    children,
                }],
            })
            const buffer = await Packer.toBuffer(doc)
            return JSON.stringify({ result: this.arrayBufferToBase64(buffer), warnings, metadata: null })
        } catch (error) {
            warnings.push(`DOCX conversion failed: ${error.message}`)
            return JSON.stringify({ result: null, warnings, metadata: null })
        }
    }
}

export const docXExporter = new DocXExporter()

MU.registerPlugin({ name: 'DocX', type: 'exporter', filename: 'markupeditor-exporter-docx.js', run: docXExporter.run.bind(docXExporter) }, 'DocX')
