import { MU } from 'markupeditor'
import { MarkdownSerializerState } from 'prosemirror-markdown'
import { makeSerializer } from './serializer.js'
import { makeParser } from './parser.js'
import { makeWarnings } from './warnings.js'
import { assignHeadingIds } from './heading-ids.js'
import { hashMarkdown } from './doc-blocks.js'
import { prepareImport } from './import-prep.js'

// The map recorded by the last successful rebaseSource, or null.
let current = null

/**
 * The recorded source map, or null when the last rebase recorded none.
 */
export function getSourceMap() {
  return current
}

const renderBlock = (state, doc, index, renderIndex = index) => {
  const outputStart = state.out.length
  state.render(doc.child(index), doc, renderIndex)
  return state.out.slice(outputStart).replace(/^\n+/, '').replace(/\n+$/, '')
}

/**
 * The Markdown a block's own source text serializes to when parsed with nothing around it, or null if it
 * does not parse to exactly one node. A block that depends on text outside its lines (a reference link)
 * serializes differently from its baseline.
 *
 * @param {string} text - the block's lines
 * @param {object} schema - ProseMirror schema
 * @param {boolean} isPreamble - true for the leading HTML run, which import turns into a fenced block
 * @param {Function} [parserFactory] - makeParser, injectable for tests
 * @returns {string|null}
 */
export function standaloneMarkdown(text, schema, isPreamble, parserFactory = makeParser) {
  const warnings = makeWarnings()
  const source = isPreamble ? prepareImport(text, warnings).modified : text
  const doc = parserFactory(schema, warnings).parse(source)
  if (doc.childCount !== 1) return null
  const serializer = makeSerializer(makeWarnings())
  const state = new MarkdownSerializerState(serializer.nodes, serializer.marks, { escapeExtraCharacters: /</g })
  // The serializer treats an html code block at index 0 as the preamble; elsewhere it is an ordinary fence.
  return renderBlock(state, doc, 0, isPreamble ? 0 : 1)
}

/**
 * Build a source map from `baseText` alone: its original lines, and for each top-level block the
 * line range it came from and the hash of its serialization.
 *
 * @param {string} baseText - Markdown the editor content was loaded from or saved as
 * @param {object} schema - ProseMirror schema
 * @param {Function} [parserFactory] - makeParser, injectable for tests
 * @returns {object} { map, reason, warnings }. `map` is null, with `reason` set, when none can be recorded.
 */
export function buildSourceMap(baseText, schema, parserFactory = makeParser) {
  const warnings = makeWarnings()
  const none = (reason) => ({ map: null, reason, warnings: warnings.get() })

  // markdown-it counts a lone CR as a line break; the line arithmetic below does not.
  if (/\r(?!\n)/.test(baseText)) return none('lone carriage return')

  const prepared = prepareImport(baseText, warnings)
  const recorder = []
  const parser = parserFactory(schema, warnings, recorder)
  const doc = assignHeadingIds(parser.parse(prepared.modified), schema, warnings)

  if (recorder.length === 0) return none('empty body')
  if (recorder.length !== doc.childCount) {
    return none(`block count ${recorder.length} differs from node count ${doc.childCount}`)
  }

  const lines = baseText.match(/[^\n]*\n|[^\n]+$/g) ?? []
  const crlf = (baseText.match(/\r\n/g) ?? []).length
  const lf = (baseText.match(/\n/g) ?? []).length - crlf

  const { yamlStartLine, yamlEndLine, htmlStartLine, htmlEndLine } = prepared
  const hasFrontMatter = yamlStartLine !== -1
  const hasHtml = htmlStartLine !== -1
  const yamlShift = hasFrontMatter ? yamlEndLine - yamlStartLine : 0
  // The HTML run becomes a fence two lines longer than the run, and sits after the removed front matter.
  const fenceStart = htmlStartLine - yamlShift
  const fenceLength = htmlEndLine - htmlStartLine + 2
  const startOf = (m) => {
    if (hasHtml && m === fenceStart) return htmlStartLine
    return (hasHtml && m >= fenceStart + fenceLength ? m - 2 : m) + yamlShift
  }
  const endOf = (m) => {
    if (hasHtml && m === fenceStart + fenceLength) return htmlEndLine
    return (hasHtml && m > fenceStart + fenceLength ? m - 2 : m) + yamlShift
  }

  const serializer = makeSerializer(makeWarnings())
  const state = new MarkdownSerializerState(serializer.nodes, serializer.marks, { escapeExtraCharacters: /</g })
  const blocks = recorder.map((token, index) => {
    const baseline = hashMarkdown(renderBlock(state, doc, index))
    const startLine = startOf(token.map[0])
    const endLine = endOf(token.map[1])
    const node = doc.child(index)
    const isPreamble = index === 0 && node.type.name === 'code_block' && node.attrs.language === 'html'
    const own = standaloneMarkdown(lines.slice(startLine, endLine).join(''), schema, isPreamble, parserFactory)
    return { startLine, endLine, baseline, preservable: own !== null && hashMarkdown(own) === baseline }
  })

  const map = {
    tag: hashMarkdown(baseText),
    lines,
    lineEnding: crlf > lf ? 'CRLF' : 'LF',
    finalNewline: baseText.endsWith('\n'),
    frontMatter: hasFrontMatter ? lines.slice(0, blocks[0].startLine).join('') : null,
    blocks,
  }
  return { map, reason: null, warnings: warnings.get() }
}

/**
 * Record the source map for `baseText` and return its tag. The map is built from `baseText` only,
 * never from the live document.
 *
 * @param {string} baseText - Markdown the editor content was loaded from or saved as
 * @returns {string} JSON string { tag: string|null, frontMatter: string|null, lineEnding: string|null, warnings: string[] }
 */
export function rebaseSource(baseText) {
  current = null
  const view = MU.activeView()
  if (!view) {
    return JSON.stringify({ tag: null, frontMatter: null, lineEnding: null, warnings: ['No active view'] })
  }
  const { map, reason, warnings } = buildSourceMap(baseText, view.state.schema)
  if (!map) {
    console.warn(`Source map not recorded: ${reason}`)
    return JSON.stringify({ tag: null, frontMatter: null, lineEnding: null, warnings })
  }
  current = map
  return JSON.stringify({ tag: map.tag, frontMatter: map.frontMatter, lineEnding: map.lineEnding, warnings })
}
