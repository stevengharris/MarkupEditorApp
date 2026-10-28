import { MU } from 'markupeditor'
import { MarkdownSerializerState } from 'prosemirror-markdown'
import { makeSerializer } from './serializer.js'
import { makeWarnings } from './warnings.js'

/**
 * A short, deterministic hash of a block's Markdown, used to tell whether a block has changed since it was
 * read. cyrb53, which needs no browser API (crypto.subtle is unavailable outside a secure context) and
 * yields 53 bits, so an accidental match between two different blocks is not a practical concern.
 *
 * @param {string} text
 * @returns {string} 14 lowercase hex characters
 */
export function hashMarkdown(text) {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0')
}

const isCodeBlock = (node, language) => node.type.name === 'code_block' && node.attrs.language === language

/**
 * The kind of the top-level block `node` at `index` of `doc`.
 *
 * Two code blocks are special, and only at the start of the document, because that is the only place the
 * serializer and the app treat them specially: the metadata block (language `metadata`, index 0) and the
 * HTML-preamble block (language `html`, index 0, or index 1 after a metadata block).
 */
export function kindOf(node, index, doc) {
  switch (node.type.name) {
    case 'paragraph':
      return node.childCount === 1 && node.firstChild.type.name === 'image' ? 'image' : 'paragraph'
    case 'heading': return 'heading'
    case 'bullet_list': return 'bullet-list'
    case 'ordered_list': return 'numbered-list'
    case 'table': return 'table'
    case 'blockquote': return 'quote'
    case 'code_block': {
      const metadataAtStart = isCodeBlock(doc.child(0), 'metadata')
      if (index === 0 && metadataAtStart) return 'metadata'
      if (index === (metadataAtStart ? 1 : 0) && isCodeBlock(node, 'html')) return 'html-preamble'
      return 'code'
    }
    default: return 'other'
  }
}

/**
 * The number of leading blocks that are special (the metadata block, then the HTML-preamble block).
 * Only the first two blocks can be.
 *
 * @param {object} doc - ProseMirror doc Node
 * @returns {number}
 */
export function firstEditableOf(doc) {
  let n = 0
  while (n < 2 && n < doc.childCount) {
    const kind = kindOf(doc.child(n), n, doc)
    if (kind !== 'metadata' && kind !== 'html-preamble') break
    n++
  }
  return n
}

/** A metadata block's front matter as it is written at the start of the file. */
const frontMatterOf = (node) => (node.textContent.trim() === '' ? '---\n---' : `---\n${node.textContent.replace(/\s+$/, '')}\n---`)

/**
 * Serialize top-level blocks of `doc`, each on its own, and describe them.
 *
 * Every block is rendered by the same serializer and the same state as an export of the whole document, with
 * the real document as its parent and its real index. The serializer's rules for the HTML-preamble block
 * depend on both. What is added to the output while a block renders is that block's Markdown, once the
 * newlines that separate it from its neighbors are trimmed, so the document's Markdown is the blocks'
 * Markdown in order with only newlines between. The metadata block is the exception: the serializer leaves
 * it out of the document's Markdown, and its block reads as the front matter the app writes at the start of
 * the saved file. A warning raised while a block renders is reported on that block. Only the blocks asked
 * for are rendered.
 *
 * Pure: it reads `doc` and nothing else, so it can be tested without an editor.
 *
 * @param {object} doc - ProseMirror doc Node
 * @param {{from?: number|null, to?: number|null, limit?: number|null}} args
 *   `from`: index of the first block to return (default 0).
 *   `to`: index after the last block to return (default the end of the document).
 *   `limit`: most characters of block Markdown to return (default no limit). Whole blocks only, and at least one.
 * @returns {object} `{ok: true, blocks, count, firstEditable, next?}`, or `{ok: false, reason}` for a bad argument.
 *   A block is `{index, kind, hash, markdown, warnings}`. `next` is the index of the first block not returned
 *   and is absent when the last block is.
 */
export function describeBlocks(doc, { from, to, limit } = {}) {
  const count = doc.childCount
  if (from !== undefined && from !== null && !(Number.isInteger(from) && from >= 0 && from < count)) {
    return { ok: false, reason: `from must be an integer from 0 to ${count - 1}` }
  }
  const start = from ?? 0
  if (to !== undefined && to !== null && !(Number.isInteger(to) && to > start && to <= count)) {
    return { ok: false, reason: `to must be an integer after from and at most ${count}` }
  }
  if (limit !== undefined && limit !== null && !(Number.isInteger(limit) && limit > 0)) {
    return { ok: false, reason: 'limit must be a positive integer' }
  }
  const end = to ?? count

  const warnings = makeWarnings()
  const serializer = makeSerializer(warnings)
  const state = new MarkdownSerializerState(serializer.nodes, serializer.marks, { escapeExtraCharacters: /</g })

  const blocks = []
  let characters = 0
  let next
  for (let index = start; index < end; index++) {
    const node = doc.child(index)
    const kind = kindOf(node, index, doc)
    const outputStart = state.out.length
    const warningsBefore = warnings.get().length
    let markdown
    if (kind === 'metadata') {
      markdown = frontMatterOf(node)
    } else {
      state.render(node, doc, index)
      markdown = state.out.slice(outputStart).replace(/^\n+/, '').replace(/\n+$/, '')
    }
    if (limit != null && blocks.length > 0 && characters + markdown.length > limit) {
      next = index
      break
    }
    blocks.push({
      index,
      kind,
      hash: hashMarkdown(markdown),
      markdown,
      warnings: warnings.get().slice(warningsBefore),
    })
    characters += markdown.length
  }

  const result = { ok: true, blocks, count, firstEditable: firstEditableOf(doc) }
  if (next !== undefined) result.next = next
  return result
}

/**
 * The top-level blocks of the active editor's document, as described by describeBlocks. Thin MU-facing wrapper:
 * it never throws across the JS/Swift bridge, and answers a missing view or a bad argument with a refusal.
 *
 * @param {number} [from]
 * @param {number} [limit]
 * @returns {string} JSON of the describeBlocks result, or `{ok: false, reason}`
 */
export function getBlocks(from, limit) {
  const view = MU.activeView()
  if (!view) return JSON.stringify({ ok: false, reason: 'No active view' })
  try {
    return JSON.stringify(describeBlocks(view.state.doc, { from, limit }))
  } catch (error) {
    return JSON.stringify({ ok: false, reason: `getBlocks failed: ${error.message}` })
  }
}
