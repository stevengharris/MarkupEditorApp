import { MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown'

/**
 * Build a MarkdownSerializer that extends the default one with custom
 * node and mark rules for the MarkupEditor schema.
 *
 * @param {object} warnings - warnings collector from makeWarnings()
 * @returns {MarkdownSerializer}
 */
export function makeSerializer(warnings) {
  // Custom node rules extending the default set
  const nodes = Object.assign({}, defaultMarkdownSerializer.nodes, {

    // image: emit ![alt](src), warn + drop width/height attrs if present
    image(state, node) {
      const { src, alt, width, height } = node.attrs
      if (width != null) {
        warnings.add(`Image width attribute dropped (not supported in Markdown): ${width}`)
      }
      if (height != null) {
        warnings.add(`Image height attribute dropped (not supported in Markdown): ${height}`)
      }
      state.write(
        '![' + state.esc(alt || '') + '](' +
        (src || '').replace(/[()]/g, '\\$&') + ')'
      )
    },

    // table: GFM pipe-table serialization
    table(state, node) {
      if (node.attrs.class != null) {
        warnings.add(`Table class attribute dropped (not supported in Markdown): ${node.attrs.class}`)
      }
      // Gather rows — first row is treated as header, rest as body
      const rows = []
      node.forEach(child => {
        if (child.type.name === 'table_row') rows.push(child)
      })
      if (rows.length === 0) return

      // Render header row
      const headerRow = rows[0]
      const cells = []
      headerRow.forEach(cell => {
        cells.push(cell.textContent.trim())
      })
      state.write('| ' + cells.join(' | ') + ' |')
      state.write('\n')

      // Separator
      state.write('| ' + cells.map(() => '---').join(' | ') + ' |')
      state.write('\n')

      // Body rows
      for (let i = 1; i < rows.length; i++) {
        const rowCells = []
        rows[i].forEach(cell => {
          rowCells.push(cell.textContent.trim())
        })
        state.write('| ' + rowCells.join(' | ') + ' |')
        state.write('\n')
      }
      state.write('\n')
    },

    // table_row and table_cell are handled inside table serializer above;
    // define them as no-ops to avoid "node not handled" errors
    table_row(state, node) {
      // Rendered by the parent table serializer
    },

    table_cell(state, node) {
      // Rendered by the parent table serializer
    },

    table_header(state, node) {
      // Rendered by the parent table serializer
    },

    // code_block: a code_block at position 0 in the doc root is treated as the
    // HTML preamble block that was injected during import. Serialize it as raw
    // HTML (no fences) so the round-trip produces the original preamble.
    // The schema has no language attribute, so detection is purely positional.
    // All other code_blocks serialize as standard fenced blocks.
    code_block(state, node, parent, index) {
      if (index === 0 && parent && parent.type.name === 'doc') {
        state.write(node.textContent)
        state.closeBlock(node)
      } else {
        state.write('```\n')
        state.text(node.textContent, false)
        state.ensureNewLine()
        state.write('```')
        state.closeBlock(node)
      }
    },

    // div: warn + serialize children as block content, drop wrapper
    div(state, node) {
      warnings.add('div element wrapper dropped (not supported in Markdown); serializing children')
      state.renderContent(node)
    },

    // button: warn + drop content entirely
    button(state, node) {
      warnings.add(`button element dropped (not supported in Markdown): "${node.textContent}"`)
    },

    // heading: wrap default to check for id attr
    heading(state, node) {
      if (node.attrs.id != null) {
        warnings.add(`Heading id attribute dropped (not supported in Markdown): ${node.attrs.id}`)
      }
      state.write(state.repeat('#', node.attrs.level) + ' ')
      state.renderInline(node, false)
      state.closeBlock(node)
    }
  })

  // Custom mark rules extending the default set
  const marks = Object.assign({}, defaultMarkdownSerializer.marks, {

    // s (strikethrough): ~~text~~
    s: {
      open: '~~',
      close: '~~',
      mixable: true,
      expelEnclosingWhitespace: true
    },

    // u (underline): warn + render as plain text
    u: {
      open(state) {
        warnings.add('Underline mark has no Markdown equivalent; rendering as plain text')
        return ''
      },
      close: ''
    },

    // sub: warn + render as plain text
    sub: {
      open(state) {
        warnings.add('Subscript mark has no Markdown equivalent; rendering as plain text')
        return ''
      },
      close: ''
    },

    // sup: warn + render as plain text
    sup: {
      open(state) {
        warnings.add('Superscript mark has no Markdown equivalent; rendering as plain text')
        return ''
      },
      close: ''
    }
  })

  return new MarkdownSerializer(nodes, marks)
}
