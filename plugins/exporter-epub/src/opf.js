import { escapeXmlText, escapeXmlAttr } from './xmlEscape.js'
import { parseMetadataList } from 'markupeditor-plugin-kit/metadata'

// EPUB3 requires dc:identifier/dc:title/dc:language plus a dcterms:modified <meta> (OPF spec,
// Package Metadata). No filename/title is passed into run() (see MarkupWKWebView+
// Extension.swift's runExporter), so identifier falls back to a freshly generated one and
// title falls back to the document's first heading (htmlToXhtml.js's extractDocumentTitle)
// when metadata doesn't set one.
//
// identifier/title/language are the only fields with dedicated defaulting logic. Every other
// field whose name is a Dublin Core element becomes a <dc:KEY> element; anything else is skipped
// with a warning, since the OPF schema rejects unknown dc: elements.
const RESERVED_KEYS = new Set(['title', 'language', 'lang', 'identifier'])

// The remaining DCMES elements permitted in an OPF <metadata> block.
const DC_ELEMENTS = new Set([
    'contributor', 'coverage', 'creator', 'date', 'description', 'format',
    'publisher', 'relation', 'rights', 'source', 'subject', 'type',
])

function manifestEntry({ id, href, mediaType, properties }) {
    const props = properties ? ` properties="${properties}"` : ''
    return `    <item id="${id}" href="${escapeXmlAttr(href)}" media-type="${mediaType}"${props}/>`
}

// `images` is the list extractImages.js returned: [{filename, mediaType}, ...], one manifest
// item per real zip entry -- not per <img> tag reuse, so a document that repeats the same image
// still gets one manifest entry per occurrence (see extractImages.js's no-dedup note).
//
// `metadata` is the document's raw frontmatter (extractMetadata), including
// the reserved keys already pulled out into identifier/title/language above -- callers don't
// need to filter it first, buildOpf does that itself so it stays the single place the
// reserved-vs-Dublin-Core split is defined.
export function buildOpf({ identifier, title, language = 'en', modified, images = [], metadata = {}, warnings = [] }) {
    const imageItems = images.map((img, i) => manifestEntry({
        id: `img${i + 1}`,
        href: img.filename,
        mediaType: img.mediaType,
    }))

    const extraLines = Object.entries(metadata)
        .filter(([key]) => !RESERVED_KEYS.has(key))
        .flatMap(([key, value]) => {
            if (!DC_ELEMENTS.has(key)) {
                warnings.push(`metadata field "${key}" is not a Dublin Core element, skipped`)
                return []
            }
            return parseMetadataList(value).map((item) => `\n    <dc:${key}>${escapeXmlText(item)}</dc:${key}>`)
        })
        .join('')

    return `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="pub-id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="pub-id">${escapeXmlText(identifier)}</dc:identifier>
    <dc:title>${escapeXmlText(title)}</dc:title>${extraLines}
    <dc:language>${escapeXmlText(language)}</dc:language>
    <meta property="dcterms:modified">${modified}</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="content" href="content.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
${imageItems.join('\n')}${imageItems.length ? '\n' : ''}  </manifest>
  <spine>
    <itemref idref="content"/>
  </spine>
</package>
`
}
