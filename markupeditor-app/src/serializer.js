import { MarkdownSerializer, defaultMarkdownSerializer } from 'prosemirror-markdown'

// Characters allowed in a Markdown fence info string. Restricts to a safe
// language-identifier set that still covers real-world tags with punctuation
// (c++, c#, objective-c, etc.) while excluding backtick and any other
// character that could break out of the ``` fence-open line on export.
// node.attrs.language comes from the schema's getAttrs (markupeditor-base),
// which extracts the class token verbatim after stripping the `language-`
// prefix — it does not itself restrict characters. Markdown import is safe
// (markdown-it's fence tokenizer forbids backticks in a backtick-fence info
// string) and paste is safe (classes are stripped before reaching the
// schema), but a hand-authored/directly-opened HTML file could carry an
// arbitrary class token, so this export path sanitizes defensively.
const FENCE_LANGUAGE_UNSAFE_CHARS = /[^A-Za-z0-9_+#.-]/g

/**
 * Sanitize a code_block's language attribute for use as a Markdown fence
 * info string. Strips any character outside a safe identifier set; if
 * nothing survives, returns '' so the fence is emitted bare (no info
 * string) rather than malformed.
 *
 * @param {string|null|undefined} language
 * @returns {string}
 */
function sanitizeFenceLanguage(language) {
  if (!language) return ''
  return language.replace(FENCE_LANGUAGE_UNSAFE_CHARS, '')
}

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

    // image: emit <img> when width or height is set (preserves sizing); fall back to ![alt](src)
    image(state, node) {
      const { src, alt, width, height } = node.attrs
      if (width != null || height != null) {
        let tag = `<img src="${src}"`
        if (alt != null)    tag += ` alt="${alt}"`
        if (width != null)  tag += ` width="${width}"`
        if (height != null) tag += ` height="${height}"`
        tag += '>'
        state.write(tag)
      } else {
        state.write(
          '![' + state.esc(alt || '') + '](' +
          (src || '').replace(/[()]/g, '\\$&') + ')'
        )
      }
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

    // code_block: two positional roles at the doc root, both keyed off `language`
    // rather than position alone, so a genuine leading code block that happens
    // to be neither role still serializes as an ordinary fenced block:
    //   - language === "metadata": the live-editor mirror of document metadata.
    //     Never emitted into the body -- MarkupDocument.metadata is serialized
    //     separately, Swift-side, as the real YAML frontmatter.
    //   - language === "html": the HTML preamble injected during import.
    //     Serialized as raw HTML, no fences, so the round-trip produces the
    //     original preamble. Normally at index 0, but shifts to index 1 when
    //     a metadata block occupies index 0.
    code_block(state, node, parent, index) {
      const atDocRoot = parent && parent.type.name === 'doc'
      const metadataAtRoot = atDocRoot && parent.childCount > 0 &&
        parent.child(0).type.name === 'code_block' && parent.child(0).attrs.language === 'metadata'

      if (atDocRoot && index === 0 && node.attrs.language === 'metadata') {
        return
      }

      const preambleIndex = metadataAtRoot ? 1 : 0
      if (atDocRoot && index === preambleIndex && node.attrs.language === 'html') {
        state.write(node.textContent)
        state.closeBlock(node)
        return
      }

      const sanitizedLanguage = sanitizeFenceLanguage(node.attrs.language)
      if (sanitizedLanguage !== (node.attrs.language || '')) {
        warnings.add(`Code block language attribute contained unsafe characters and was stripped: ${node.attrs.language}`)
      }
      state.write('```' + sanitizedLanguage + '\n')
      state.text(node.textContent, false)
      state.ensureNewLine()
      state.write('```')
      state.closeBlock(node)
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

    // heading: id is dropped silently -- it's routinely present on any heading an internal
    // link targets (MU.insertInternalLink), not a sign of unexpected data loss like the other
    // warn+drop rules in this file. Markdown has no syntax to carry it either way.
    heading(state, node) {
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
