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
  const tokenizer = new MarkdownIt({ html: false })

  // Start from the default token set and add table + strikethrough support
  const tokens = Object.assign({}, defaultMarkdownParser.tokens, {
    // GFM table nodes — map to prosemirror-tables node types
    // thead and tbody are structural wrappers in markdown-it but not in the schema;
    // ignore them so only table/table_row/table_cell are created.
    table:    { block: 'table' },
    thead:    { ignore: true },
    tbody:    { ignore: true },
    tr:       { block: 'table_row' },
    // th maps to table_cell (header status is not preserved in the schema)
    th:       { block: 'table_cell' },
    td:       { block: 'table_cell' },

    // Strikethrough mark
    s:        { mark: 's' }
  })

  return new MarkdownParser(schema, tokenizer, tokens)
}
