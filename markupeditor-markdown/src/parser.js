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

    // table_cell requires block+ content. The prosemirror-markdown `block` mapping
    // would open the cell node and let inline text land directly in it, but
    // `createAndFill` would then silently drop the text because it can't satisfy
    // the `block+` constraint with raw inline nodes.
    //
    // Instead, use custom `_open`/`_close` handlers that also open/close a
    // paragraph inside each cell so the inline text has a valid block to live in.
    //
    // th maps to table_cell (header status is not preserved in the schema)

    // Strikethrough mark
    s:        { mark: 's' }
  })

  // Manually add cell handlers that wrap content in a paragraph.
  // We reach into the tokenHandlers map after construction via a wrapper.
  const cellOpen = (state) => {
    state.openNode(schema.nodes.table_cell, null)
    state.openNode(schema.nodes.paragraph, null)
  }
  const cellClose = (state) => {
    state.closeNode() // close paragraph
    state.closeNode() // close table_cell
  }

  // Build the parser, then replace the auto-generated th/td handlers with our
  // paragraph-wrapping versions.  MarkdownParser stores handlers in
  // `this.tokenHandlers` which is a plain object we can patch directly.
  const parser = new MarkdownParser(schema, tokenizer, tokens)
  parser.tokenHandlers['th_open']  = cellOpen
  parser.tokenHandlers['th_close'] = cellClose
  parser.tokenHandlers['td_open']  = cellOpen
  parser.tokenHandlers['td_close'] = cellClose

  parser.tokenHandlers['html_block'] = (state, tok) => {
    warnings.add(`Raw HTML block stripped (not supported in MarkupEditor): ${tok.content.slice(0, 60).trim()}`)
  }
  parser.tokenHandlers['html_inline'] = (state, tok) => {
    // Insert as literal text rather than dropping — preserves content like \<substitutions>
    // where the backslash escape was consumed by the JS string transport layer.
    state.addText(tok.content)
  }

  return parser
}
