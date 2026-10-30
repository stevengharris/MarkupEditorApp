import { MU, DOMSerializer } from "markupeditor"
import { makeSerializer } from './serializer.js'
import { makeParser } from './parser.js'
import { makeWarnings } from './warnings.js'
import { assignHeadingIds } from './heading-ids.js'
import { prepareImport } from './import-prep.js'
import { getSourceMap } from './source-map.js'
import { preserveMarkdown } from './preserve.js'

/**
 * A function to mirror getHTML that makes it simpler for plugin consumption.
 */
export function getMarkdown() {
    return JSON.parse(exportMarkdown()).result
}

/**
 * Export the active editor content as Markdown.
 *
 * With `options.preserve` true and `options.tag` equal to the tag of the recorded source map, blocks
 * that are unchanged since the source was recorded keep their original lines. Any other argument,
 * including the string the native bridge passes, exports every block from the editor.
 *
 * @param {object} [options] - { preserve: boolean, tag: string }
 * @returns {string} JSON string { result: string|null, warnings: string[] }
 */
export function exportMarkdown(options) {
  const view = MU.activeView()
  if (!view) {
    return JSON.stringify({ result: null, warnings: ['No active view'] })
  }
  const doc = view.state.doc
  const warnings = makeWarnings()
  const map = getSourceMap()
  const opts = options && typeof options === 'object' ? options : {}
  if (opts.preserve === true && map && opts.tag === map.tag) {
    try {
      const preserveWarnings = makeWarnings()
      const result = preserveMarkdown(doc, map, preserveWarnings)
      return JSON.stringify({ result, warnings: preserveWarnings.get() })
    } catch (error) {
      console.warn(`Preserving export failed: ${error.message}`)
    }
  }
  const serializer = makeSerializer(warnings)
  // Escape bare < in text so re-import treats them as escaped characters, not html_inline
  const markdown = serializer.serialize(doc, { escapeExtraCharacters: /</g })
  return JSON.stringify({ result: markdown, warnings: warnings.get() })
}

/**
 * Import Markdown content, converting it to HTML for the editor.
 * Strips YAML frontmatter (returning it in `metadata`) and converts leading
 * HTML blocks into a fenced code_block before the main parse.
 *
 * @param {string} content - Markdown string to import
 * @returns {string} JSON string { result: string|null, warnings: string[], metadata?: string }
 */
export function importMarkdown(content) {
  const view = MU.activeView()
  if (!view) {
    return JSON.stringify({ result: null, warnings: ['No active view'] })
  }
  const schema = view.state.schema
  const warnings = makeWarnings()

  const { modified, yamlContent } = prepareImport(content, warnings)

  // Step 4: Parse modified content with the main parser
  const parser = makeParser(schema, warnings)
  const doc = assignHeadingIds(parser.parse(modified), schema, warnings)
  const domSerializer = DOMSerializer.fromSchema(schema)
  const div = document.createElement('div')
  div.appendChild(domSerializer.serializeFragment(doc.content))

  const out = { result: div.innerHTML, warnings: warnings.get() }
  if (yamlContent !== null && yamlContent !== '') out.metadata = yamlContent
  return JSON.stringify(out)
}
