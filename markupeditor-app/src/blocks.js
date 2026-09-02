import { MU, TextSelection } from 'markupeditor'
import MarkdownIt from 'markdown-it'
import frontMatterPlugin from 'markdown-it-front-matter'

/**
 * Index of the top-level child of `doc` containing `pos`.
 *
 * Pure: takes a ProseMirror doc Node (or anything exposing `content.forEach`),
 * no MU/view access. Clamps out-of-range pos to the nearest valid index
 * (before the first child -> 0, past the end -> last index); an empty doc
 * returns 0.
 *
 * @param {object} doc - ProseMirror doc Node
 * @param {number} pos - document position
 * @returns {number} 0-based top-level child index
 */
export function blockIndexForPos(doc, pos) {
  const children = []
  doc.content.forEach((node, offset) => children.push({ node, offset }))
  if (children.length === 0) return 0

  for (let i = 0; i < children.length; i++) {
    const { node, offset } = children[i]
    const end = offset + node.nodeSize
    if (pos < end || i === children.length - 1) return i
  }
  return children.length - 1
}

/**
 * Document position at the START of the content of the Nth top-level child
 * of `doc` -- inside the node, not at its boundary, so a TextSelection can be
 * created there directly.
 *
 * Pure: takes a ProseMirror doc Node (or anything exposing `content.forEach`),
 * no MU/view access. Clamps an out-of-range index to the first/last child;
 * an empty doc returns 0.
 *
 * A non-integer index (NaN, a float, undefined, ...) degrades to the first
 * child rather than throwing: Math.min/Math.max propagate NaN silently, and
 * an unguarded NaN array index would otherwise reach the caller as a
 * TypeError -- unacceptable for selectBlockIndex, a public MU-facing bridge
 * entry point Swift calls directly (must never throw across the bridge).
 *
 * @param {object} doc - ProseMirror doc Node
 * @param {number} index - 0-based top-level child index
 * @returns {number} document position
 */
export function posForBlockIndex(doc, index) {
  const children = []
  doc.content.forEach((node, offset) => children.push({ node, offset }))
  if (children.length === 0) return 0

  if (!Number.isInteger(index)) {
    // Degrading to block 0 is indistinguishable from a legitimate call with
    // index 0, or the pre-feature "no selection restored" behavior -- warn
    // so a real Swift-side bad-value bug is visible in the WKWebView
    // inspector instead of silently looking like correct behavior.
    console.warn(`posForBlockIndex: non-integer index (${index}), defaulting to block 0`)
  }
  const safeIndex = Number.isInteger(index) ? index : 0
  const clamped = Math.max(0, Math.min(safeIndex, children.length - 1))
  return children[clamped].offset + 1
}

/**
 * Block index containing the active editor's current selection, or null if
 * there is no active view. Thin MU-facing wrapper over blockIndexForPos --
 * mirrors markdown.js's no-active-view handling (never throws across the
 * JS/Swift bridge; a null return tells Swift not to attempt a restore).
 *
 * @returns {number|null}
 */
export function getSelectionBlockIndex() {
  const view = MU.activeView()
  if (!view) return null
  return blockIndexForPos(view.state.doc, view.state.selection.from)
}

/**
 * Select the start of the Nth top-level block in the active editor. No-ops
 * (does not throw) when there is no active view. Thin MU-facing wrapper over
 * posForBlockIndex.
 *
 * posForBlockIndex's position lands correctly inside a paragraph/heading, but
 * for a non-textblock wrapper (bullet_list, ordered_list, table, blockquote)
 * it lands inside the WRAPPER node, whose inlineContent is false --
 * TextSelection.create at that position does not throw (prosemirror-state
 * only warns, once, globally) but produces an invalid/invisible selection.
 * TextSelection.near searches forward from the resolved position for the
 * nearest position a TextSelection can actually anchor to (e.g. into the
 * list's first item, the table's first cell). The whole call is wrapped in
 * try/catch as defense-in-depth for the same never-throw-across-the-bridge
 * contract as posForBlockIndex's index guard.
 *
 * @param {number} n - 0-based top-level block index
 */
export function selectBlockIndex(n) {
  const view = MU.activeView()
  if (!view) return
  const pos = posForBlockIndex(view.state.doc, n)
  try {
    const selection = TextSelection.near(view.state.doc.resolve(pos), 1)
    const tr = view.state.tr.setSelection(selection)
    view.dispatch(tr)
  } catch (e) {
    console.warn(`selectBlockIndex(${n}): could not construct a selection at pos ${pos}`, e)
  }
}

/**
 * 0-based start line numbers of the top-level markdown blocks in
 * `markdownText`, aligned 1:1 with the top-level ProseMirror children
 * importMarkdown (src/markdown.js) produces from the same text.
 *
 * Mirrors, but does not call, importMarkdown's normalization -- that function
 * is on the hot path for every file open/toggle and does text rewriting, a
 * different job. Two things must be mirrored to stay aligned:
 *
 *  - markdown-it-front-matter is required, not optional: without it a
 *    frontmatter document parses to one extra top-level token (hr + 2
 *    headings instead of front_matter + heading), while the ProseMirror side
 *    has exactly one metadata block ONLY WHEN the frontmatter's YAML is
 *    non-empty. MarkupDocument.seedMetadataBlock (Helpers/MarkupDocument.swift:331)
 *    is `guard !metadata.isEmpty else { return html }` -- conditional, not an
 *    unconditional prepend. Empty or comment-only YAML parses to zero
 *    MetadataTuples, so no block is ever prepended, while
 *    markdown-it-front-matter still recognizes the frontmatter and
 *    topLevelBlockStarts still counts it -- a real, whole-document
 *    off-by-one divergence (see blocks.test.js's consistency suite
 *    empty-frontmatter fixture, which pins it rather than papering over it).
 *  - contiguous LEADING html_block tokens collapse into a single entry, same
 *    as importMarkdown collapsing them into one fenced code_block.
 *
 * Token filter is `level === 0 && nesting >= 0 && map != null`: level 0 is
 * what actually discriminates top-level tokens from ones nested inside a
 * list/blockquote/etc (nested content sits at level >= 1); nesting >= 0 only
 * drops _close tokens, which carry no boundary info of their own; map != null
 * drops inline/hidden tokens that have no line range.
 *
 * A non-string markdownText (null/undefined) degrades to "no blocks" rather
 * than throwing -- same never-throw-across-the-bridge contract as the index
 * guards on posForBlockIndex/blockIndexAtOffset/offsetForBlockIndex.
 *
 * @param {string} markdownText
 * @returns {number[]} start line numbers, one per top-level block
 */
export function topLevelBlockStarts(markdownText) {
  if (typeof markdownText !== 'string') {
    // See posForBlockIndex's guard comment: degrading silently makes a real
    // caller bug indistinguishable from "no blocks", so warn.
    console.warn(`topLevelBlockStarts: non-string markdownText (${markdownText}), returning []`)
    return []
  }

  const normalized = markdownText.replace(/\r\n/g, '\n')

  const md = new MarkdownIt({ html: true })
  md.use(frontMatterPlugin, () => {})
  const tokens = md.parse(normalized, {})

  const topTokens = tokens.filter(t => t.level === 0 && t.nesting >= 0 && t.map != null)

  const starts = []
  let i = 0

  if (i < topTokens.length && topTokens[i].type === 'front_matter') {
    starts.push(topTokens[i].map[0])
    i++
  }

  if (i < topTokens.length && topTokens[i].type === 'html_block') {
    starts.push(topTokens[i].map[0])
    i++
    while (i < topTokens.length && topTokens[i].type === 'html_block') i++
  }

  for (; i < topTokens.length; i++) {
    starts.push(topTokens[i].map[0])
  }

  return starts
}

// Offset unit: JS string index, i.e. UTF-16 code units -- the native unit of
// a JS string's .length. Cumulative line.length + 1 summation below is what
// makes this the unit; it's also the only unit that composes with
// topLevelBlockStarts's line numbers, themselves derived from markdown-it
// token .map ranges over the same JS string. Swift's String.count is
// grapheme-cluster based and DIVERGES from UTF-16 code unit count on
// emoji/combining marks -- the Swift bridge must convert via the UTF-16
// view, not Character count, to stay aligned with these functions.

/**
 * Character offset of the start of the line at `lineNumber` in `lines`
 * (already split on '\n'), clamped to a valid line index.
 */
function offsetForLine(lines, lineNumber) {
  const clamped = Math.max(0, Math.min(lineNumber, lines.length - 1))
  let offset = 0
  for (let i = 0; i < clamped; i++) offset += lines[i].length + 1
  return offset
}

/**
 * Line number containing `charOffset` in `lines` (already split on '\n'),
 * clamped to a valid line index.
 */
function lineForOffset(lines, charOffset) {
  let offset = 0
  for (let i = 0; i < lines.length; i++) {
    const lineEnd = offset + lines[i].length + 1
    if (charOffset < lineEnd || i === lines.length - 1) return i
    offset = lineEnd
  }
  return Math.max(0, lines.length - 1)
}

/**
 * Top-level block index containing `charOffset` in `markdownText`.
 *
 * A character offset falling on a blank line between blocks belongs to NO
 * block's own line range (markdown-it token .map ranges don't cover
 * separator blank lines) -- the correct block is the LAST one whose start
 * line is <= the offset's line, clamped to the first block when the offset
 * precedes it. See topLevelBlockStarts's doc comment for the token filter
 * this is built on.
 *
 * A non-string markdownText (null/undefined) degrades to 0 rather than
 * throwing -- see topLevelBlockStarts's doc comment.
 *
 * @param {string} markdownText
 * @param {number} charOffset - UTF-16 code unit offset into markdownText
 * @returns {number} 0-based top-level block index
 */
export function blockIndexAtOffset(markdownText, charOffset) {
  if (typeof markdownText !== 'string') {
    console.warn(`blockIndexAtOffset: non-string markdownText (${markdownText}), defaulting to 0`)
    return 0
  }

  const normalized = markdownText.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const starts = topLevelBlockStarts(normalized)
  if (starts.length === 0) return 0

  const line = lineForOffset(lines, Math.max(0, charOffset))
  let index = 0
  for (let i = 0; i < starts.length; i++) {
    if (starts[i] <= line) index = i
    else break
  }
  return index
}

/**
 * Character offset of the start of the Nth top-level block in
 * `markdownText`. Clamps an out-of-range index to the first/last block.
 *
 * A non-string markdownText (null/undefined) degrades to 0 rather than
 * throwing -- see topLevelBlockStarts's doc comment.
 *
 * @param {string} markdownText
 * @param {number} index - 0-based top-level block index
 * @returns {number} UTF-16 code unit offset into markdownText
 */
export function offsetForBlockIndex(markdownText, index) {
  if (typeof markdownText !== 'string') {
    console.warn(`offsetForBlockIndex: non-string markdownText (${markdownText}), defaulting to 0`)
    return 0
  }

  const normalized = markdownText.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const starts = topLevelBlockStarts(normalized)
  if (starts.length === 0) return 0

  const clamped = Math.max(0, Math.min(index, starts.length - 1))
  return offsetForLine(lines, starts[clamped])
}
