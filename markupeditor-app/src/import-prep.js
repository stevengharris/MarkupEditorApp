import MarkdownIt from 'markdown-it'
import frontMatterPlugin from 'markdown-it-front-matter'

/**
 * Normalize line endings, detect YAML front matter and a leading run of HTML blocks, and produce the
 * text the main parser is given: front matter removed and the HTML run wrapped in one fenced block.
 * Line numbers are over the LF-normalized text, which has the same line count as `content`.
 *
 * @param {string} content - Markdown string
 * @param {object} warnings - warnings collector from makeWarnings()
 * @returns {object} { modified, yamlContent, yamlStartLine, yamlEndLine, htmlStartLine, htmlEndLine }
 *   Line numbers are -1 when the part is absent; end lines are exclusive.
 */
export function prepareImport(content, warnings) {
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
  const env = {}
  const tokens = md.parse(normalized, env)
  if (env.references && Object.keys(env.references).length > 0) {
    warnings.add('Link reference definitions are saved as inline links.')
  }

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

  return { modified, yamlContent, yamlStartLine, yamlEndLine, htmlStartLine, htmlEndLine }
}
