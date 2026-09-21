import { escapeXmlText, escapeXmlAttr } from './xmlEscape.js'

// Dispatch table covers every tag markupeditor-base's schema can produce (schema/index.js is
// the authority, verified empirically against exporter-docx's equivalent table in
// htmlToDocx.js) -- an unrecognized tag warns instead of dropping silently.
//
// Unlike HTML -> OOXML (exporter-docx), HTML -> XHTML is nearly a well-formedness pass rather
// than a structural translation: XHTML natively represents nested blockquotes, real <ul>/<ol>/
// <li> list semantics, <table>/<thead>/<tbody>/<tfoot> structure, heading `id` anchors, and
// `<ol start>` directly -- none of the numbering/style-identity workarounds htmlToDocx.js needs
// for OOXML's flatter model are needed here. That also means several DOCX limitations don't
// carry over: internal `<a href="#id">` links resolve for real (headings keep their `id`), and
// `<ol start>` is honored rather than warned about.

const VOID_TAGS = new Set(['br', 'img', 'hr'])

// Attributes preserved verbatim (after escaping) per tag, matching what markupeditor-base's
// schema is documented to actually emit (see htmlToDocx.js's per-tag comments for the same
// inventory, e.g. table's `class`, td/th's colspan/rowspan/style, ol's `start`).
const ATTRS_BY_TAG = {
    a: ['href', 'title'],
    img: ['src', 'alt', 'width', 'height'],
    ol: ['start'],
    table: ['class'],
    td: ['colspan', 'rowspan', 'style'],
    th: ['colspan', 'rowspan', 'style'],
    h1: ['id'], h2: ['id'], h3: ['id'], h4: ['id'], h5: ['id'], h6: ['id'],
    div: ['id', 'class'],
    code: ['class'], // the fenced code_block's language-X class -- kept as a CSS/highlighter hook, unlike DOCX which has nowhere to hang it
}

// Tags with no special handling below recurse generically: serialize the tag, copy its
// allowed attributes, recurse into children. block-vs-inline is not a meaningful distinction
// at the XHTML syntax level the way it is for OOXML's Paragraph/run split.
const GENERIC_TAGS = new Set([
    'p', 'blockquote', 'div',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th',
    'strong', 'em', 'u', 's', 'sub', 'sup', 'code',
    'a',
])

function attrString(element, tag) {
    const names = ATTRS_BY_TAG[tag]
    if (!names) return ''
    let out = ''
    for (const name of names) {
        const value = element.getAttribute(name)
        if (value !== null) out += ` ${name}="${escapeXmlAttr(value)}"`
    }
    return out
}

// A text node that is entirely whitespace AND contains a newline is pretty-printing/indentation
// artifact, not meaningful content (e.g. "<p>\n    <s>text</s>\n</p>" from a formatted HTML
// source) -- matches htmlToDocx.js's isInsignificantWhitespace exactly, including the
// justification.
function isInsignificantWhitespace(text) {
    return text.trim() === '' && text.includes('\n')
}

function convertChildren(element, context) {
    let out = ''
    for (const node of element.childNodes) {
        out += convertNode(node, context)
    }
    return out
}

// Schema: code_block content is "text*" with marks disabled, rendered <pre><code
// class="language-X">. Line breaks and all whitespace inside are significant and preserved
// verbatim -- unlike generic recursion, this never drops or re-escapes structurally, only
// entity-escapes for well-formedness.
function convertCodeBlock(element, context) {
    const code = element.querySelector('code') ?? element
    const languageClass = code.getAttribute('class')
    const classAttr = languageClass ? ` class="${escapeXmlAttr(languageClass)}"` : ''
    return `<pre><code${classAttr}>${escapeXmlText(code.textContent)}</code></pre>`
}

// Dropped entirely: an interactive affordance with no static-document representation (same
// decision as htmlToDocx.js's convertButton).
function convertButton() {
    return ''
}

function convertBr() {
    return '<br/>'
}

function convertHr() {
    return '<hr/>'
}

// resolveImages.js + extractImages.js run as pre-passes before this converter: every
// embeddable <img> arrives here with `src` already rewritten to a relative "images/imageN.ext"
// zip href. An <img> whose src is still a raw data:/http(s):/file: URI means something upstream
// didn't run -- warn rather than ship an EPUB with an unreachable reference. alt is REQUIRED
// (defaults to "") for EPUB accessibility conformance even when the source document omitted it.
function convertImg(element, context) {
    const src = element.getAttribute('src')
    if (!src || !src.startsWith('images/')) {
        context.warnings.push(`<img> with an unresolved src is not embeddable here -- expected resolveImages/extractImages to have already run (got "${src}")`)
        return ''
    }
    const alt = element.getAttribute('alt') ?? ''
    let tag = `<img src="${escapeXmlAttr(src)}" alt="${escapeXmlAttr(alt)}"`
    const width = element.getAttribute('width')
    const height = element.getAttribute('height')
    if (width !== null) tag += ` width="${escapeXmlAttr(width)}"`
    if (height !== null) tag += ` height="${escapeXmlAttr(height)}"`
    return tag + '/>'
}

// Schema: the 7 non-code marks map 1:1 onto a real XHTML inline element (unlike OOXML, which
// needs flat run properties -- see htmlToDocx.js's MARK_PROPS) -- `code` renders as <code>,
// which XHTML also has natively.
const SPECIAL_HANDLERS = {
    pre: convertCodeBlock,
    button: convertButton,
    br: convertBr,
    hr: convertHr,
    img: convertImg,
}

function convertElement(element, context) {
    const tag = element.tagName.toLowerCase()
    const special = SPECIAL_HANDLERS[tag]
    if (special) return special(element, context)
    if (GENERIC_TAGS.has(tag)) {
        const attrs = attrString(element, tag)
        if (VOID_TAGS.has(tag)) return `<${tag}${attrs}/>`
        return `<${tag}${attrs}>${convertChildren(element, context)}</${tag}>`
    }
    context.warnings.push(`unhandled tag <${tag}>`)
    return ''
}

function convertNode(node, context) {
    if (node.nodeType === Node.TEXT_NODE) {
        if (isInsignificantWhitespace(node.textContent)) return ''
        return escapeXmlText(node.textContent)
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return ''
    return convertElement(node, context)
}

// Entry point: parses `html` and returns the XHTML markup for the content document's <body>
// (the caller wraps it with the XHTML5 doctype/head). Independent of MU and the plugin
// envelope, so it's unit-testable in isolation, same contract as htmlToDocxChildren.
export function htmlToXhtmlBody(html, warnings = []) {
    const context = { warnings }
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    return convertChildren(parsed.body, context)
}

// Used for the EPUB's dc:title -- MU.getHTML() carries no separate document-title field
// (docxexporter.js has the same gap and doesn't set a title at all; EPUB3 requires one), so the
// first <h1>'s text is the best available signal. Falls back to a generic default when there
// is none.
export function extractDocumentTitle(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const h1 = parsed.body.querySelector('h1')
    const text = h1?.textContent?.trim()
    return text || 'Untitled Document'
}

// Used to build the EPUB3 nav document's table of contents (nav.js). Only headings that carry
// a real `id` (heading-ids.js assigns one to every heading the real import pipeline produces)
// can be a link target -- an id-less heading still renders in the content document, it just
// has no nav entry, which is a nav-only limitation, not a lossy conversion worth a warning.
export function extractHeadings(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    const headings = []
    for (const el of parsed.body.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
        const id = el.getAttribute('id')
        if (!id) continue
        headings.push({ level: Number(el.tagName[1]), id, text: el.textContent.trim() })
    }
    return headings
}
