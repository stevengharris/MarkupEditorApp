import { DOMSerializer } from 'prosemirror-model'
import { makeSerializer } from './serializer.js'
import { makeParser } from './parser.js'
import { makeWarnings } from './warnings.js'
import { schema } from 'markupeditor/src/schema/index.js'

// ---------------------------------------------------------------------------
// Plugin registration
// ---------------------------------------------------------------------------

const muEl = document.querySelector('markup-editor')
if (!muEl) throw new Error('markup-editor element not found; plugin loaded too early')
const MU = muEl.MU

/**
 * Export the active editor content as Markdown.
 *
 * @param {string} _content - unused; content comes from the active view
 * @returns {string} JSON string { result: string|null, warnings: string[] }
 */
export function exportFn(_content) {
  const view = MU.activeView()
  if (!view) {
    return JSON.stringify({ result: null, warnings: ['No active view'] })
  }
  const doc = view.state.doc
  const warnings = makeWarnings()
  const serializer = makeSerializer(warnings)
  const markdown = serializer.serialize(doc)
  return JSON.stringify({ result: markdown, warnings: warnings.get() })
}

/**
 * Import Markdown content, converting it to HTML for the editor.
 *
 * @param {string} content - Markdown string to import
 * @returns {string} JSON string { result: string|null, warnings: string[] }
 */
export function importFn(content) {
  const warnings = makeWarnings()
  const parser = makeParser(schema, warnings)
  const doc = parser.parse(content)
  const serializer = DOMSerializer.fromSchema(schema)
  const div = document.createElement('div')
  div.appendChild(serializer.serializeFragment(doc.content))
  return JSON.stringify({ result: div.innerHTML, warnings: warnings.get() })
}

MU.registerPlugin({
  id: 'markdown',
  name: 'Markdown',
  extension: 'md',
  export: exportFn,
  import: importFn
})
