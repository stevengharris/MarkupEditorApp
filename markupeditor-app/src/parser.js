import { MarkdownParser, defaultMarkdownParser } from 'prosemirror-markdown'
import MarkdownIt from 'markdown-it'

/**
 * Build a MarkdownParser that handles GFM tables and strikethrough,
 * in addition to all the tokens handled by defaultMarkdownParser.
 *
 * @param {object} schema   - ProseMirror Schema instance
 * @param {object} warnings - warnings collector from makeWarnings()
 * @returns {MarkdownParser}
 */
export function makeParser(schema, warnings) {
  // Use markdown-it in 'default' mode (includes table support) with html disabled.
  // The 'default' mode includes GFM tables; commonmark does not.
  const tokenizer = new MarkdownIt({ html: true })

  // Start from the default token set and add table + strikethrough support
  const tokens = Object.assign({}, defaultMarkdownParser.tokens, {
    // GFM table nodes — map to prosemirror-tables node types
    // thead and tbody are structural wrappers in markdown-it but not in the schema;
    // ignore them so only table/table_row/table_cell are created.
    table:    { block: 'table' },
    thead:    { ignore: true },
    tbody:    { ignore: true },
    tr:       { block: 'table_row' },

    // table_cell/table_header require block+ content. The prosemirror-markdown `block`
    // mapping would open the cell node and let inline text land directly in it, but
    // `createAndFill` would then silently drop the text because it can't satisfy
    // the `block+` constraint with raw inline nodes.
    //
    // Instead, use custom `_open`/`_close` handlers that also open/close a
    // paragraph inside each cell so the inline text has a valid block to live in.
    // th maps to table_header (not table_cell) so a real header row survives a
    // round-trip through Markdown -- the serializer only treats row 1 as a header
    // when it's actually made of table_header cells.

    // Strikethrough mark
    s:        { mark: 's' },

    // fence: prosemirror-markdown's built-in default maps tok.info to a
    // `params` attr, but the code_block schema declares `language` instead
    // — the built-in default is a silent no-op against this schema.
    // Only the first whitespace-delimited word of the info string is the
    // language per CommonMark convention (e.g. "js {1,3}" -> "js", discarding
    // the rest). An absent/empty info string must map to `null`, matching the
    // schema's `attrs: {language: {default: null}}` — a naive split would
    // yield "" instead, breaking attrs equality on round-trip.
    fence: {
      block: 'code_block',
      getAttrs: tok => {
        const first = (tok.info || '').trim().split(/\s+/)[0]
        return { language: first || null }
      },
      noCloseToken: true
    }
  })

  // GFM column alignment rides on each cell's own th_open/td_open token as a
  // style="text-align:..." attribute (markdown-it does not emit a separate token for
  // the delimiter row itself) -- extract it so cellOpen/headerCellOpen can carry it
  // through to the table_cell/table_header node's align attr.
  function alignFromToken(tok) {
    const style = tok.attrGet('style')
    if (!style) return null
    const m = style.match(/text-align:\s*(left|center|right)/)
    return m ? m[1] : null
  }

  // Manually add cell handlers that wrap content in a paragraph.
  // We reach into the tokenHandlers map after construction via a wrapper.
  const cellOpen = (state, tok) => {
    const align = alignFromToken(tok)
    state.openNode(schema.nodes.table_cell, align ? { align } : null)
    state.openNode(schema.nodes.paragraph, null)
  }
  const cellClose = (state) => {
    state.closeNode() // close paragraph
    state.closeNode() // close table_cell
  }
  const headerCellOpen = (state, tok) => {
    const align = alignFromToken(tok)
    state.openNode(schema.nodes.table_header, align ? { align } : null)
    state.openNode(schema.nodes.paragraph, null)
  }
  const headerCellClose = (state) => {
    state.closeNode() // close paragraph
    state.closeNode() // close table_header
  }

  // Build the parser, then replace the auto-generated th/td handlers with our
  // paragraph-wrapping versions.  MarkdownParser stores handlers in
  // `this.tokenHandlers` which is a plain object we can patch directly.
  const parser = new MarkdownParser(schema, tokenizer, tokens)
  parser.tokenHandlers['th_open']  = headerCellOpen
  parser.tokenHandlers['th_close'] = headerCellClose
  parser.tokenHandlers['td_open']  = cellOpen
  parser.tokenHandlers['td_close'] = cellClose

  // Minimal double-quoted attribute extractor for self-closing <img> tags.
  // Single-quoted and unquoted attribute values are out of scope.
  function parseImgTag(html) {
    const m = html.match(/<img\s([^>]*)>/i)
    if (!m) return null
    const attrs = m[1]
    const get = (name) => {
      const r = attrs.match(new RegExp(`${name}="([^"]*)"`, 'i'))
      return r ? r[1] : null
    }
    const w = get('width'), h = get('height')
    return {
      src:    get('src'),
      alt:    get('alt'),
      width:  w != null ? parseInt(w,  10) : null,
      height: h != null ? parseInt(h,  10) : null,
    }
  }

  // html_block: standalone <img> on its own line becomes a paragraph containing
  // an image node. image is inline:true — adding it directly to doc context
  // silently drops it, so the paragraph wrapper is required.
  parser.tokenHandlers['html_block'] = (state, tok) => {
    const img = parseImgTag(tok.content.trim())
    if (img && img.src) {
      state.openNode(schema.nodes.paragraph, null)
      state.addNode(schema.nodes.image, img)
      state.closeNode()
    } else {
      warnings.add(`Raw HTML block stripped (not supported in MarkupEditor): ${tok.content.slice(0, 60).trim()}`)
    }
  }

  // html_inline: <img> within paragraph text becomes an inline image node;
  // everything else warns and is dropped.
  parser.tokenHandlers['html_inline'] = (state, tok) => {
    const img = parseImgTag(tok.content)
    if (img && img.src) {
      state.addNode(schema.nodes.image, img)
    } else {
      warnings.add(`Raw HTML inline stripped (not supported in MarkupEditor): ${tok.content.trim()}`)
    }
  }

  return parser
}
