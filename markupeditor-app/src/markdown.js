import { MU, DOMSerializer } from "markupeditor"
import { makeSerializer } from './serializer.js'
import { makeParser } from './parser.js'
import { makeWarnings } from './warnings.js'
import MarkdownIt from 'markdown-it'
import frontMatterPlugin from 'markdown-it-front-matter'

/**
 * A function to mirror getHTML that makes it simpler for plugin consumption.
 */
export function getMarkdown() {
    return exportMarkdown().result
}

/**
 * Export the active editor content as Markdown.
 *
 * @returns {string} JSON string { result: string|null, warnings: string[] }
 */
export function exportMarkdown() {
  const view = MU.activeView()
  if (!view) {
    return JSON.stringify({ result: null, warnings: ['No active view'] })
  }
  const doc = view.state.doc
  const warnings = makeWarnings()
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

  // Step 1: Normalize line endings
  const normalized = content.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')

  // Convert a line index to its character offset in `normalized`
  function lineOffset(i) {
    let off = 0
    for (let n = 0; n < i && n < lines.length; n++) off += lines[n].length + 1
    return off
  }

  // Step 2: Single detection parse using a disposable markdown-it instance.
  // html: true required so that leading HTML blocks are tokenized as html_block,
  // not silently folded into paragraph tokens.
  let yamlContent = null
  const md = new MarkdownIt({ html: true })
  md.use(frontMatterPlugin, (yaml) => { yamlContent = yaml })
  const tokens = md.parse(normalized, {})

  // Locate YAML frontmatter token (map holds [startLine, endLine] inclusive/exclusive)
  let yamlStartLine = -1, yamlEndLine = -1
  const fmToken = tokens.find(t => t.type === 'front_matter')
  if (fmToken && fmToken.map) {
    yamlStartLine = fmToken.map[0]
    yamlEndLine   = fmToken.map[1]
  }

  // Collect contiguous leading html_block tokens (skipping front_matter)
  let htmlStartLine = -1, htmlEndLine = -1
  for (const tok of tokens) {
    // Skip frontmatter and structural (hidden) tokens — they don't represent content boundaries
    if (tok.type === 'front_matter' || tok.hidden) continue
    if (tok.type === 'html_block' && tok.map) {
      if (htmlStartLine === -1) htmlStartLine = tok.map[0]
      htmlEndLine = tok.map[1]
    } else {
      break
    }
  }

  // Step 3: Apply edits from end toward front so earlier offsets stay valid
  let modified = normalized

  if (htmlStartLine !== -1) {
    const htmlContent = lines.slice(htmlStartLine, htmlEndLine).join('\n')
    const replacement = '```html\n' + htmlContent + '\n```\n'
    modified = modified.slice(0, lineOffset(htmlStartLine)) + replacement + modified.slice(lineOffset(htmlEndLine))
  }

  if (yamlStartLine !== -1) {
    // YAML is always before HTML, so its char offset in `modified` is still valid
    modified = modified.slice(0, lineOffset(yamlStartLine)) + modified.slice(lineOffset(yamlEndLine))
  }

  // Step 4: Parse modified content with the main parser
  const parser = makeParser(schema, warnings)
  const doc = parser.parse(modified)
  const domSerializer = DOMSerializer.fromSchema(schema)
  const div = document.createElement('div')
  div.appendChild(domSerializer.serializeFragment(doc.content))

  const out = { result: div.innerHTML, warnings: warnings.get() }
  if (yamlContent !== null && yamlContent !== '') out.metadata = yamlContent
  return JSON.stringify(out)
}
