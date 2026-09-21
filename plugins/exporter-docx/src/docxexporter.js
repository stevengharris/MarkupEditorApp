import { MU } from "markupeditor"
import pkg from "../package.json" with { type: "json" }
import { Document, Packer } from "docx"
import { resolveImages } from "markupeditor-plugin-kit/images"
import { failureEnvelope, successEnvelope } from "markupeditor-plugin-kit/export"
import { registerExporter } from "markupeditor-plugin-kit/register"
import { htmlToDocxChildren, PAGE_WIDTH_TWIPS, PAGE_HEIGHT_TWIPS, PAGE_MARGIN_TWIPS } from "./htmlToDocx.js"
import { documentStyles } from "./styles.js"
import { numberingConfig } from "./numbering.js"
import { extractMetadata, metadataScalar, parseMetadataList, stripMetadataBlock } from "markupeditor-plugin-kit/metadata"

export class DocXExporter {

    async run() {
        const warnings = []
        try {
            const html = await resolveImages(stripMetadataBlock(MU.getHTML()), warnings)
            const children = htmlToDocxChildren(html, warnings)
            const metadata = extractMetadata(MU)
            const keywords = parseMetadataList(metadata.keywords)
            const doc = new Document({
                // docx's Document constructor exposes these directly (IPropertiesOptions) --
                // only set when present, so an untagged/unauthored document gets no empty
                // core-properties entries. Field names (creator/keywords) match
                // IPropertiesOptions directly rather than translating from another vocabulary
                // (e.g. "author") -- one name, not a synonym to remember.
                ...(metadata.title ? { title: metadataScalar(metadata.title) } : {}),
                ...(metadata.creator ? { creator: metadataScalar(metadata.creator) } : {}),
                ...(metadata.description ? { description: metadataScalar(metadata.description) } : {}),
                ...(keywords.length ? { keywords: keywords.join(', ') } : {}),
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
            return successEnvelope(buffer, warnings)
        } catch (error) {
            return failureEnvelope(warnings, 'DOCX', error)
        }
    }
}

export const docXExporter = new DocXExporter()

registerExporter(pkg.markupeditor, { run: docXExporter.run.bind(docXExporter) })
