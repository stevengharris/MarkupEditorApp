import { Paragraph, TextRun, HeadingLevel, BorderStyle, Table, TableRow, TableCell, ExternalHyperlink, ImageRun, WidthType, TableLayoutType } from 'docx'
import { CODE_FONT, QUOTE_MAX_DEPTH, quoteStyleId } from './styles.js'
import { LEVEL_COUNT as LIST_LEVEL_COUNT } from './numbering.js'

// Dispatch table covers every tag markupeditor-base's schema can produce (schema/index.js is
// the authority). An unrecognized tag warns instead of dropping silently; tags without a
// handler yet point at notYetImplemented() so the map stays a complete schema inventory.
//
// blockquote's content is "block+", so it can wrap ANY block, including code_block -- an
// indented code block is <blockquote><pre><code>, not code_block's inherent shape.

function notYetImplemented(element, context) {
    context.warnings.push(`<${element.tagName.toLowerCase()}> is recognized but not yet converted`)
    return []
}

// div has no OOXML block-container equivalent -- recurse into children, discard the wrapper.
function convertDiv(element, context) {
    return convertChildren(element, context)
}

// Dropped entirely: an interactive affordance with no static-document representation.
function convertButton(_element, _context) {
    return []
}

// listStyle wins over quoteStyle -- a paragraph carries only one `style`, and ListParagraph
// is what makes Word/Pages recognize it as a real list item. Falls back to 'Body' rather than
// leaving pStyle implicit/absent: an absent w:pStyle does not reliably resolve to a named
// default style in Pages.
function paragraphStyleFrom(context) {
    return context.listStyle ?? context.quoteStyle ?? 'Body'
}

function applyListMark(options, context) {
    if (context.listMark) {
        options.numbering = { reference: context.listMark.reference, level: context.listMark.level, instance: context.listMark.instance }
    }
}

function convertParagraph(element, context) {
    const options = { children: convertInline(element, context) }
    const style = paragraphStyleFrom(context)
    if (style) options.style = style
    applyListMark(options, context)
    return [new Paragraph(options)]
}

// blockquote wraps ANY block (schema: content "block+") -- recurses generically, no
// code_block special case. Its only contribution is a style identity: contained blocks get
// `style: quoteStyleId(depth)` via `context.quoteStyle` (see styles.js's Quote-family comment
// for why nesting can't be a direct paragraph-level w:ind).
function convertBlockquote(element, context) {
    const depth = (context.quoteDepth ?? 0) + 1
    if (depth > QUOTE_MAX_DEPTH) {
        context.warnings.push(`blockquote nested ${depth} levels deep, clamped to ${QUOTE_MAX_DEPTH}`)
    }
    const childContext = {
        ...context,
        quoteDepth: depth,
        quoteStyle: quoteStyleId(Math.min(depth, QUOTE_MAX_DEPTH)),
    }
    return convertChildren(element, childContext)
}

// code_block content is "text*" with marks disabled (schema), rendered <pre><code
// class="language-X">. One Paragraph per code_block, not per line -- line breaks use the same
// mechanism as <br> so it stays one cohesive block. The language-X class is dropped (no OOXML
// syntax-highlighting concept to hang it on). SF Mono is a run-level font override, so it
// combines fine with a Quote pStyle when this code_block sits inside a blockquote.
function convertCodeBlock(element, context) {
    const code = element.querySelector('code') ?? element
    const text = code.textContent
    const lines = text.split('\n')
    const runs = []
    lines.forEach((line, i) => {
        if (i > 0) runs.push(new TextRun({ break: 1 }))
        if (line) runs.push(new TextRun({ text: line, font: CODE_FONT }))
    })
    const options = { children: runs }
    const style = paragraphStyleFrom(context)
    if (style) options.style = style
    applyListMark(options, context)
    return [new Paragraph(options)]
}

const HEADING_LEVEL_BY_TAG = {
    h1: HeadingLevel.HEADING_1,
    h2: HeadingLevel.HEADING_2,
    h3: HeadingLevel.HEADING_3,
    h4: HeadingLevel.HEADING_4,
    h5: HeadingLevel.HEADING_5,
    h6: HeadingLevel.HEADING_6,
}

// The heading `id` attribute (schema: local-link target) is dropped, not carried into a docx
// bookmark -- wiring it through needs a BookmarkStart/BookmarkEnd pair here plus resolving
// <a href="#id"> below, with no current need for working intra-document links.
function convertHeading(element, context) {
    const tag = element.tagName.toLowerCase()
    // `heading` and `style` are mutually exclusive on a docx Paragraph, so a heading inside a
    // blockquote can't also carry the Quote style that gives blockquote content its indent.
    if (context.quoteStyle) {
        context.warnings.push(`<${tag}> inside a blockquote keeps its heading style; the blockquote's indent is not applied to headings`)
    }
    const options = { heading: HEADING_LEVEL_BY_TAG[tag], children: convertInline(element, context) }
    applyListMark(options, context)
    return [new Paragraph(options)]
}

// Conventional OOXML expression of <hr>: an empty paragraph with a bottom border, via docx's
// typed border config -- not raw XML, and no named style for a single rule.
function convertHorizontalRule(_element, _context) {
    return [new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '000000' } },
    })]
}

function listFormatForTag(tag) {
    return tag === 'ol' ? 'decimal' : 'bullet'
}

// An <ul>/<ol> nested inside an <li> of a list with the SAME format increments ilvl under the
// SAME numId. A DIFFERENT format (mixed <ul>-in-<ol> or vice versa) starts a new, independent
// list instance so it counts independently (a nested numbered sublist restarts at 1) --
// docx's LevelOverride only supports overriding a level's start number, not its format, so one
// numId can't mix bullet and decimal levels.
//
// `depth` always reflects true nesting depth, incremented at every level regardless of format
// match; only `instance` depends on the match. This keeps a cross-format transition at the
// correct deeper indent instead of resetting to its parent's level, which would read as a peer
// rather than a sublist.
function convertList(tag, element, context) {
    const format = listFormatForTag(tag)
    if (tag === 'ol') {
        const start = element.getAttribute('start')
        if (start && start !== '1') {
            context.warnings.push(
                `<ol start="${start}"> is not honored -- numbering always starts at 1 ` +
                '(markupeditor-base\'s ordered_list does support a real start/order attribute; ' +
                'a per-instance start override is not currently wired)'
            )
        }
    }
    const nestingSameFormat = context.listFormat === format
    const depth = (context.listLevel ?? -1) + 1
    if (depth > LIST_LEVEL_COUNT - 1) {
        context.warnings.push(`list nested ${depth + 1} levels deep, clamped to ${LIST_LEVEL_COUNT}`)
    }
    const level = Math.min(depth, LIST_LEVEL_COUNT - 1)
    const instance = nestingSameFormat ? context.listInstance : context.nextListInstance.value++
    const listContext = { ...context, listFormat: format, listLevel: level, listInstance: instance }

    const children = []
    for (const li of element.children) {
        if (li.tagName.toLowerCase() !== 'li') {
            context.warnings.push(`unexpected <${li.tagName.toLowerCase()}> inside <${tag}>, expected <li>`)
            continue
        }
        children.push(...convertListItem(li, listContext))
    }
    return children
}

// Schema: list_item content is '(paragraph | heading)+ block*' -- only the FIRST child gets
// the numbering mark. Non-heading children get ListParagraph so continuation content still
// aligns under it. A heading child keeps its HeadingN style instead: docx only auto-applies
// ListParagraph when neither `style` nor `heading` is set, and a heading's size/weight is more
// useful to preserve than forcing it to read as a generic list item.
function convertListItem(element, context) {
    const blocks = []
    let index = 0
    for (const child of element.children) {
        const childContext = { ...context, listStyle: 'ListParagraph' }
        if (index === 0) {
            childContext.listMark = { reference: context.listFormat, level: context.listLevel, instance: context.listInstance }
        }
        blocks.push(...convertBlock(child, childContext))
        index++
    }
    return blocks
}

// Matches markup.css's border color (#DDD), verified directly against the stylesheet.
const TABLE_BORDER_COLOR = 'DDDDDD'

function borderLine() {
    return { style: BorderStyle.SINGLE, size: 4, color: TABLE_BORDER_COLOR }
}

// Class values verified directly from styles/markup.css, per markupeditor-base's schema
// comment for the table `class` attribute:
//   bordered-table-none:   no borders at all.
//   bordered-table-outer:  outer edge only, no lines between cells.
//   bordered-table-header: outer edge, plus a border on <th> cells specifically (see
//                          headerCellsGetOwnBorder below) -- <td> cells get none.
//   bordered-table-cell, or no class (markup.css's documented default matches
//   bordered-table-cell): outer edge plus a full grid.
// docx has no named "TableGrid" style (see styles.js) -- every table sets these borders
// directly.
//
// docx applies its own default tblBorders (full grid, auto-color) whenever a side is left
// unspecified, confirmed empirically -- a PARTIAL borders object still gets
// insideHorizontal/insideVertical filled from that default. Every side must be set
// explicitly, including to NONE.
const NO_BORDER = { style: BorderStyle.NONE }

function tableBordersForClass(cssClass) {
    const outer = { top: borderLine(), bottom: borderLine(), left: borderLine(), right: borderLine() }
    const noInside = { insideHorizontal: NO_BORDER, insideVertical: NO_BORDER }
    if (cssClass === 'bordered-table-none') {
        return { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER, ...noInside }
    }
    if (cssClass === 'bordered-table-outer' || cssClass === 'bordered-table-header') {
        return { ...outer, ...noInside }
    }
    return { ...outer, insideHorizontal: borderLine(), insideVertical: borderLine() }
}

function headerCellsGetOwnBorder(cssClass) {
    return cssClass === 'bordered-table-header'
}

// The schema's `background` cell attribute round-trips through a real inline
// `style="background-color: ..."`. happy-dom (and real browsers) normalize element.style to
// `rgb(r, g, b)`; a literal #hex is accepted as a fallback.
function parseBackgroundColor(element) {
    const value = element.style?.backgroundColor
    if (!value) return null
    const rgbMatch = value.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/)
    if (rgbMatch) {
        return rgbMatch.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, '0')).join('').toUpperCase()
    }
    const hexMatch = value.match(/#([0-9a-fA-F]{6})/)
    return hexMatch ? hexMatch[1].toUpperCase() : null
}

// cellContent is 'block+' (schema) -- recurses through the normal block dispatch, no special
// casing.
function convertTableCell(element, context) {
    const tag = element.tagName.toLowerCase()
    const options = { children: convertChildren(element, context) }
    const colspan = Number(element.getAttribute('colspan'))
    if (colspan > 1) options.columnSpan = colspan
    const rowspan = Number(element.getAttribute('rowspan'))
    if (rowspan > 1) options.rowSpan = rowspan
    const fill = parseBackgroundColor(element)
    if (fill) options.shading = { fill }
    if (tag === 'th' && headerCellsGetOwnBorder(context.tableClass)) {
        options.borders = { top: borderLine(), bottom: borderLine(), left: borderLine(), right: borderLine() }
    }
    return new TableCell(options)
}

function convertTableRow(element, context) {
    const cells = []
    for (const cell of element.children) {
        const tag = cell.tagName.toLowerCase()
        if (tag !== 'td' && tag !== 'th') {
            context.warnings.push(`unexpected <${tag}> inside <tr>, expected <td> or <th>`)
            continue
        }
        cells.push(convertTableCell(cell, context))
    }
    return new TableRow({ children: cells })
}

// The HTML parser auto-inserts a <tbody> around bare <tr> children on every parse, confirmed
// empirically -- this is the normal case, so un-guarded `element.children` iteration would
// only ever see the wrapper and warn on every table. Handles <thead>/<tfoot> the same way.
// Does not recurse further than one level, so a nested <table> inside a cell isn't mistaken
// for this table's rows.
function tableRows(tableElement, context) {
    const rows = []
    for (const child of tableElement.children) {
        const tag = child.tagName.toLowerCase()
        if (tag === 'tr') {
            rows.push(child)
        } else if (tag === 'tbody' || tag === 'thead' || tag === 'tfoot') {
            for (const row of child.children) {
                if (row.tagName.toLowerCase() === 'tr') rows.push(row)
                else context.warnings.push(`unexpected <${row.tagName.toLowerCase()}> inside <${tag}>, expected <tr>`)
            }
        } else {
            context.warnings.push(`unexpected <${tag}> inside <table>, expected <tr>/<tbody>/<thead>/<tfoot>`)
        }
    }
    return rows
}

// US Letter (8.5in x 11in), 1in margins. Exported so docxexporter.js's Document section config
// uses these same numbers -- docx's library default is A4 (11906 x 16838 twips), not Letter.
export const PAGE_WIDTH_TWIPS = 12240
export const PAGE_HEIGHT_TWIPS = 15840
export const PAGE_MARGIN_TWIPS = 1440

// Letter content width (8.5in page, 1in margins each side = 6.5in), used only to compute even
// per-column widths for `layout: FIXED`.
const PAGE_CONTENT_WIDTH_TWIPS = PAGE_WIDTH_TWIPS - 2 * PAGE_MARGIN_TWIPS

// Accounts for colspan (a colspan=N cell occupies N grid columns) -- the widest row, not just
// the first, determines the real column count.
function tableColumnCount(rawRows) {
    let max = 1
    for (const row of rawRows) {
        let count = 0
        for (const cell of row.children) {
            const tag = cell.tagName.toLowerCase()
            if (tag !== 'td' && tag !== 'th') continue
            const colspan = Number(cell.getAttribute('colspan'))
            count += colspan > 1 ? colspan : 1
        }
        if (count > max) max = count
    }
    return max
}

function convertTable(element, context) {
    const cssClass = element.getAttribute('class')
    const tableContext = { ...context, tableClass: cssClass }
    // Called once, not once-per-use -- tableRows() pushes warnings as a side effect, and
    // calling it twice would duplicate them.
    const rawRows = tableRows(element, context)
    const columnCount = tableColumnCount(rawRows)
    const columnWidth = Math.floor(PAGE_CONTENT_WIDTH_TWIPS / columnCount)
    const rows = rawRows.map((row) => convertTableRow(row, tableContext))
    // Matches markup.css's `table { width: 100%; table-layout: fixed; }`. width alone isn't
    // enough: without `layout: FIXED` and real per-column widths, Word/Pages' AUTOFIT still
    // shrinks columns to content. columnWidths distributes content width evenly across the
    // real column count (accounting for colspan).
    const options = {
        rows,
        width: { size: 100, type: WidthType.PERCENTAGE },
        columnWidths: Array(columnCount).fill(columnWidth),
        layout: TableLayoutType.FIXED,
    }
    const borders = tableBordersForClass(cssClass)
    if (borders) options.borders = borders
    return [new Table(options)]
}

const BLOCK_HANDLERS = {
    p: convertParagraph,
    blockquote: convertBlockquote,
    hr: convertHorizontalRule,
    h1: convertHeading,
    h2: convertHeading,
    h3: convertHeading,
    h4: convertHeading,
    h5: convertHeading,
    h6: convertHeading,
    pre: convertCodeBlock,
    div: convertDiv,
    button: convertButton,
    ul: (element, context) => convertList('ul', element, context),
    ol: (element, context) => convertList('ol', element, context),
    li: notYetImplemented, // dispatched directly by convertList -> convertListItem, not reached in normal flow
    table: convertTable,
    tr: notYetImplemented, // dispatched directly by convertTable -> tableRows -> convertTableRow
    td: notYetImplemented, // dispatched directly by convertTableRow -> convertTableCell
    th: notYetImplemented, // dispatched directly by convertTableRow -> convertTableCell
}

// Exported so a single handler can be unit-tested in isolation -- e.g. dispatching a <td>
// pulled from a real <table><tr><td> fragment, since the HTML parser refuses to keep bare
// tr/td/th outside a table context.
export function convertBlock(element, context) {
    const tag = element.tagName.toLowerCase()
    const handler = BLOCK_HANDLERS[tag]
    if (!handler) {
        context.warnings.push(`unhandled tag <${tag}>`)
        return []
    }
    return handler(element, context)
}

function convertChildren(element, context) {
    const children = []
    for (const child of element.children) {
        children.push(...convertBlock(child, context))
    }
    return children
}

// The 7 non-code marks (schema: markupeditor-base/src/schema/index.js) map to a TextRun-level
// boolean/object property; `code` needs a font/shading pair so it's handled separately below.
// Marks combine onto ONE set of run properties rather than nested runs, since a run carries
// its formatting as flat properties.
const MARK_PROPS = {
    strong: 'bold',
    em: 'italics',
    u: 'underline',
    s: 'strike',
    sub: 'subScript',
    sup: 'superScript',
    code: 'code',
}

// Matches markup.css's inline `code` rule (font-family: 'SF Mono', ...; background-color:
// #F8F8F8 in light mode).
const INLINE_CODE_SHADING = 'F8F8F8'

function runPropsFromMarks(marks) {
    const props = {}
    if (marks.bold) props.bold = true
    if (marks.italics) props.italics = true
    if (marks.underline) props.underline = {}
    if (marks.strike) props.strike = true
    if (marks.subScript) props.subScript = true
    if (marks.superScript) props.superScript = true
    if (marks.code) {
        props.font = CODE_FONT
        props.shading = { fill: INLINE_CODE_SHADING }
    }
    // docx ships a real 'Hyperlink' character style by default -- referenced here, never
    // defined. Combines with any other active mark (a bold, underlined hyperlink is valid
    // OOXML; style + direct run formatting don't conflict the way paragraph style + w:ind do).
    if (marks.hyperlink) props.style = 'Hyperlink'
    return props
}

// resolveImages.js runs first as an async HTML-string pre-pass and rewrites every embeddable
// image to a data: URI with corrected width/height attributes. This function only decodes an
// already-resolved data: URI to bytes. An unresolvable image never reaches here -- it's
// already rewritten to a plain <a> link placeholder.
const DATA_URI_PATTERN = /^data:image\/(\w+);base64,(.+)$/

function convertImage(element, context) {
    const src = element.getAttribute('src')
    const match = src && src.match(DATA_URI_PATTERN)
    if (!match) {
        context.warnings.push(`<img> with an unresolved src is not embeddable here -- expected resolveImages to have already run (got "${src}")`)
        return []
    }
    const [, mime, base64] = match
    const type = mime === 'jpeg' ? 'jpg' : mime // docx's image type enum has "jpg", not "jpeg"
    const width = Number(element.getAttribute('width'))
    const height = Number(element.getAttribute('height'))
    // Number(null) is 0, not NaN, so a missing dimension can't rely on a NaN check -- without
    // this guard a missing/zero dimension would silently embed an invisible image.
    if (!(width > 0) || !(height > 0)) {
        context.warnings.push(`<img> has no usable width/height (got width="${element.getAttribute('width')}" height="${element.getAttribute('height')}") -- skipped rather than embedding an invisible image`)
        return []
    }
    return [new ImageRun({ type, data: base64, transformation: { width, height } })]
}

// Walks inline content recursively, threading active marks down through nesting so they
// combine onto whichever TextRuns get produced. Block content nests as a tree of distinct
// paragraphs; inline marks nest as accumulating properties of one flat run.
function convertInlineNodes(nodes, context, marks) {
    const children = []
    for (const node of nodes) {
        if (node.nodeType === Node.TEXT_NODE) {
            if (node.textContent) children.push(new TextRun({ text: node.textContent, ...runPropsFromMarks(marks) }))
            continue
        }
        const tag = node.tagName.toLowerCase()
        if (tag === 'br') {
            children.push(new TextRun({ break: 1, ...runPropsFromMarks(marks) }))
            continue
        }
        if (MARK_PROPS[tag]) {
            children.push(...convertInlineNodes(Array.from(node.childNodes), context, { ...marks, [MARK_PROPS[tag]]: true }))
            continue
        }
        if (tag === 'a') {
            const href = node.getAttribute('href')
            // link `title` is dropped entirely, not read at all here.
            if (!href) {
                children.push(...convertInlineNodes(Array.from(node.childNodes), context, marks))
                continue
            }
            if (href.startsWith('#')) {
                // Headings never emit a bookmark (see convertHeading), so an internal link has
                // nowhere real to point.
                context.warnings.push(`internal link href="${href}" dropped -- no bookmark target exists (heading ids are not carried into bookmarks)`)
                children.push(...convertInlineNodes(Array.from(node.childNodes), context, marks))
                continue
            }
            const linkRuns = convertInlineNodes(Array.from(node.childNodes), context, { ...marks, hyperlink: true })
            children.push(new ExternalHyperlink({ link: href, children: linkRuns }))
            continue
        }
        if (tag === 'img') {
            children.push(...convertImage(node, context))
            continue
        }
        context.warnings.push(`inline <${tag}> not yet converted`)
    }
    return children
}

function convertInline(element, context) {
    return convertInlineNodes(Array.from(element.childNodes), context, {})
}

// Entry point: parses `html` and returns the docx block-level children for a single Document
// section. Independent of MU and the plugin envelope, so it's unit-testable in isolation.
export function htmlToDocxChildren(html, warnings = []) {
    // A mutable shared counter, not a plain number on `context` -- every convertList call
    // that starts a NEW list instance needs to see and increment the same counter, including
    // calls reached from unrelated sibling subtrees.
    const context = { warnings, nextListInstance: { value: 1 } }
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    return convertChildren(parsed.body, context)
}
