import { MU } from 'markupeditor'
import MarkdownIt from 'markdown-it'
import frontMatterPlugin from 'markdown-it-front-matter'
import { makeParser } from './parser.js'
import { makeWarnings } from './warnings.js'
import { describeBlocks, firstEditableOf, kindOf } from './doc-blocks.js'
import { headingIdAssignments, unmatchedLinkTargets } from './heading-ids.js'
import { applyImagePolicy, isRelativeImageSrc } from './image-policy.js'

// The meta key prosemirror-history reads to end the current undo event, so the change is not undone together
// with the user's typing before it, nor typing right after it with the change. The editor's copy of the
// history module creates this key first, which gives it this name; if it were ever different, setting it
// would do nothing and a change could join a neighboring undo event, not break anything else.
const CLOSE_HISTORY = 'closeHistory$'

const SPECIAL_KINDS = new Set(['metadata', 'html-preamble'])

/**
 * The front matter that opens `markdown`, found with the tokenizer the Markdown import uses so that what a file
 * reads as front matter is what is read here.
 *
 * @returns {{yaml: string, rest: string} | null}
 */
function splitFrontMatter(markdown) {
  let yaml = null
  const md = new MarkdownIt({ html: true })
  md.use(frontMatterPlugin, (content) => { yaml = content })
  const token = md.parse(markdown, {}).find(t => t.type === 'front_matter')
  if (!token || !token.map || token.map[0] !== 0) return null
  // An opening --- with no closing one runs to the end of a file, but a fragment that does so is a rule.
  const lines = markdown.split('\n')
  if (token.map[1] - token.map[0] < 2 || !/^---\s*$/.test(lines[token.map[1] - 1])) return null
  // Prose between two rules is not front matter; an empty span is, so that it can be refused with a reason.
  if ((yaml ?? '').trim() !== '' && !(yaml ?? '').includes(':')) return null
  return { yaml: yaml ?? '', rest: lines.slice(token.map[1]).join('\n') }
}

/**
 * Splits the HTML blocks that open `markdown` from the rest, the way opening a Markdown file folds its leading
 * HTML into the HTML-preamble block. Nothing but blank lines may come before the HTML, or the lines before it
 * would be lost.
 *
 * @returns {{html: string, rest: string} | null} null when `markdown` does not open with an HTML block
 */
function splitLeadingHtml(markdown) {
  const lines = markdown.split('\n')
  const tokens = new MarkdownIt({ html: true }).parse(markdown, {})
  let start = -1
  let end = -1
  for (const token of tokens) {
    if (token.hidden) continue
    if (token.type !== 'html_block' || !token.map) break
    if (start === -1) start = token.map[0]
    end = token.map[1]
  }
  if (start === -1 || start !== lines.findIndex(line => line.trim() !== '')) return null
  return { html: lines.slice(start, end).join('\n').replace(/\s+$/, ''), rest: lines.slice(end).join('\n') }
}

const FORBIDDEN_ELEMENTS = new Set(['script', 'iframe', 'object', 'embed', 'base', 'link', 'meta', 'form', 'template'])
const LOADING_ATTRIBUTES = new Set(['src', 'poster', 'background', 'data', 'action', 'formaction', 'href', 'xlink:href'])
const SCRIPT_URL = /^(?:javascript|vbscript|data:text\/html):/i
const CSS_URL = /url\s*\(\s*["']?([^"')]*)/gi
const CSS_REFERENCE = /@import|image-set|\\/i

/**
 * Why an HTML header may not be written, or null when it may. The header is saved into the file as written, so
 * it is held to the image policy: while remote images are restricted nothing in it may load from a web address.
 * Scripts, frames and event handlers are never allowed. It is read as a document, so character references and
 * unquoted attributes cannot hide a source.
 */
function headerProblem(html, restrictImages) {
  const forbidden = (what) => `The HTML header cannot contain ${what}; it is saved into the file as written.`
  const remoteProblem = (src) => `The HTML header would load from a web address (${src}), and the user's Settings restrict remote images. Use a relative path, or ask the user to allow remote images in Settings.`
  const loads = []
  const parsed = new DOMParser().parseFromString(html, 'text/html')
  for (const element of parsed.querySelectorAll('*')) {
    const tag = element.localName
    if (FORBIDDEN_ELEMENTS.has(tag)) return forbidden(`<${tag}> elements`)
    if (tag === 'style') loads.push({ css: element.textContent })
    for (const { name, value } of element.attributes) {
      const scheme = value.replace(/[\u0000-\u0020]+/g, '')
      if (name.startsWith('on') || SCRIPT_URL.test(scheme)) return forbidden('event handler attributes or javascript: links')
      if (name === 'style') loads.push({ css: value })
      else if (name === 'srcset') loads.push(...value.split(',').map(candidate => ({ src: candidate.trim().split(/\s+/)[0] })))
      else if (LOADING_ATTRIBUTES.has(name) && !(name === 'href' && (tag === 'a' || tag === 'area'))) loads.push({ src: value })
    }
  }
  if (restrictImages === false) return null
  for (const { src, css } of loads) {
    if (css !== undefined) {
      if (CSS_REFERENCE.test(css)) return remoteProblem(css.match(CSS_REFERENCE)[0])
      const remote = [...css.matchAll(CSS_URL)].map(match => match[1]).find(url => !isRelativeImageSrc(url))
      if (remote !== undefined) return remoteProblem(remote)
    } else if (!isRelativeImageSrc(src)) {
      return remoteProblem(src)
    }
  }
  return null
}

const LIST_TYPES = new Set(['bullet_list', 'ordered_list'])

const refuse = (reason, blocks) => (blocks ? { ok: false, reason, blocks } : { ok: false, reason })

/**
 * Plan a change to the top-level blocks of `state`'s document, without applying it.
 *
 * Replaces `count` blocks starting at `index` with the blocks in `markdown`, which is imported with the
 * Markdown parser alone. `count` 0 inserts before block `index` (an `index` equal to the number of blocks
 * appends); an empty `markdown` with `count` above 0 deletes. Block types come from the Markdown.
 *
 * The metadata and HTML-preamble blocks are blocks like the others. Front matter that opens `markdown` at
 * index 0 becomes the metadata block, and HTML blocks that open it at the position where the HTML-preamble
 * block belongs become that block. A change must not turn a block it leaves alone into, or out of, one of
 * the two roles, which only the first positions of the document carry.
 *
 * `expected` guards against a stale read: for `count` above 0, the hashes of the blocks being replaced as they
 * were read; for `count` 0, the hash of the block just before `index`, or none when `index` is 0.
 * Nothing changes when any differs, and the reply carries the current blocks. A block whose Markdown could not
 * hold something it holds (it has export warnings) is replaced only when `allowLoss` is true.
 *
 * Arguments are validated, not clamped. The change is one transaction.
 *
 * @param {object} state - EditorState
 * @param {{index: number, count: number, markdown: string, expected: string[], allowLoss?: boolean, restrictImages?: boolean, allowSpecialBlocks?: boolean}} args
 * @returns {object} `{ok: false, reason, blocks?}`, or `{ok: true, tr, range: {index, count}, blocks, warnings}`
 *   where `blocks` are the new blocks and `warnings` are the import's, plus `metadataRemoved: true` when the
 *   change removed the metadata block.
 */
export function planReplace(state, { index, count, markdown, expected, allowLoss, restrictImages = true, allowSpecialBlocks = true }) {
  const total = state.doc.childCount
  // Only the blocks a check needs are serialized.
  const blocksAt = (from, to) => (to > from ? describeBlocks(state.doc, { from, to }).blocks : [])

  if (!Number.isInteger(index) || index < 0 || index > total) {
    return refuse(`index must be an integer from 0 to ${total}`)
  }
  if (!Number.isInteger(count) || count < 0) {
    return refuse('count must be a non-negative integer')
  }
  if (index + count > total) {
    return refuse(`index ${index} with count ${count} passes the last block (the document has ${total} blocks)`)
  }
  if (typeof markdown !== 'string') {
    return refuse('markdown must be a string')
  }
  const deleting = markdown.trim() === ''
  if (count === 0 && deleting) {
    return refuse('an insert needs markdown')
  }
  if (deleting && count === total) {
    return refuse('that would delete every block; the document keeps at least one block')
  }

  const hashesNeeded = count > 0 ? count : (index === 0 ? 0 : 1)
  if (!Array.isArray(expected) || expected.length !== hashesNeeded || !expected.every(h => typeof h === 'string')) {
    const what = count > 0 ? `the hashes of the ${count} block${count === 1 ? '' : 's'} being replaced`
      : (hashesNeeded === 0 ? 'no hashes (an insert at index 0)' : 'the hash of the block just before index')
    return refuse(`expected must be an array of strings: ${what}`)
  }

  // Are the blocks still what the caller read?
  const checked = count > 0 ? blocksAt(index, index + count) : (hashesNeeded === 0 ? [] : blocksAt(index - 1, index))
  if (checked.some((block, i) => block.hash !== expected[i])) {
    const shown = count > 0 ? checked : blocksAt(Math.max(index - 1, 0), Math.min(index + 1, total))
    return refuse('The document changed since it was read: the blocks here no longer match the expected hashes. Nothing was changed.', shown)
  }

  // Would the replaced blocks lose something that Markdown cannot carry?
  if (count > 0 && allowLoss !== true) {
    const lossy = checked.filter(block => block.warnings.length > 0)
    if (lossy.length > 0) {
      return refuse('A block being replaced holds something its Markdown cannot carry (see its warnings). Replacing it loses that; pass allowLoss true to go ahead.', lossy)
    }
  }

  const codeBlock = state.schema.nodes.code_block
  let text = deleting ? '' : markdown.replace(/\r\n/g, '\n')
  const special = []

  // Front matter opens the document, so it can only be written there.
  const frontMatter = deleting ? null : splitFrontMatter(text.replace(/^\uFEFF/, ''))
  if (frontMatter) {
    if (index !== 0) {
      return refuse(`Front matter can only be written at index 0, the start of the document; this change starts at index ${index}.`)
    }
    if (frontMatter.yaml.trim() === '') {
      return refuse('The front matter has no keys. Write at least one key: value line, or delete the metadata block.')
    }
    special.push(codeBlock.create({ language: 'metadata' }, state.schema.text(frontMatter.yaml.replace(/\s+$/, ''))))
    text = frontMatter.rest
  }

  // HTML blocks that open the fragment where the HTML-preamble block belongs are that block, as when a file opens.
  const metadataFirst = !!frontMatter || (index > 0 && kindOf(state.doc.child(0), 0, state.doc) === 'metadata')
  const landing = frontMatter ? 1 : index
  if (!deleting && landing === (metadataFirst ? 1 : 0)) {
    const leading = splitLeadingHtml(text)
    if (leading) {
      special.push(codeBlock.create({ language: 'html' }, state.schema.text(leading.html)))
      text = leading.rest
    }
  }

  const warnings = makeWarnings()
  let fragment
  if (!deleting) {
    try {
      const body = []
      if (text.trim() !== '' || special.length === 0) makeParser(state.schema, warnings).parse(text).forEach(node => body.push(node))
      fragment = state.schema.nodes.doc.create(null, [...special, ...body])
    } catch (error) {
      return refuse(`The Markdown could not be imported: ${error.message}`)
    }
  }

  const importWarnings = warnings.get()
  if (fragment) {
    // Images already in the replaced blocks may be written again unchanged.
    const keepSrcs = new Set()
    for (let i = index; i < index + count; i++) {
      state.doc.child(i).descendants(node => { if (node.type.name === 'image') keepSrcs.add(node.attrs.src) })
    }
    if (restrictImages !== false) {
      const applied = applyImagePolicy(fragment, state.schema, keepSrcs)
      fragment = applied.fragment
      importWarnings.push(...applied.warnings)
    }
  }

  const offsets = []
  state.doc.forEach((_node, offset) => offsets.push(offset))
  offsets.push(state.doc.content.size)
  const from = offsets[index]
  const to = offsets[index + count]

  const tr = state.tr
  if (deleting) tr.delete(from, to)
  else tr.replaceWith(from, to, fragment.content)
  tr.setMeta(CLOSE_HISTORY, true)
  if (!deleting) {
    for (const { pos, id } of headingIdAssignments(tr.doc, state.schema)) {
      tr.setNodeMarkup(pos, null, { ...tr.doc.nodeAt(pos).attrs, id })
    }
    for (const target of unmatchedLinkTargets(fragment, tr.doc, state.schema)) {
      importWarnings.push(`Internal link target "#${target}" does not match any heading`)
    }
  }

  const newCount = deleting ? 0 : fragment.childCount

  // The two special roles belong to the first positions of the document, so a block the change leaves alone must
  // not move into or out of one.
  const newIndexOf = (at) => (at < index ? at : at - count + newCount)
  for (let at = 0; at < total; at++) {
    if ((at >= index && at < index + count) || (at > 1 && newIndexOf(at) > 1)) continue
    const was = kindOf(state.doc.child(at), at, state.doc)
    const now = kindOf(tr.doc.child(newIndexOf(at)), newIndexOf(at), tr.doc)
    if ((SPECIAL_KINDS.has(was) || SPECIAL_KINDS.has(now)) && was !== now) {
      return refuse('That change would turn a block it leaves alone into, or out of, the metadata or HTML-preamble block, which only the first blocks of the document can be. Replace or delete the metadata or HTML-preamble block itself, or make the change after them.')
    }
  }
  for (let at = index; at < index + newCount; at++) {
    const kind = kindOf(tr.doc.child(at), at, tr.doc)
    if (!SPECIAL_KINDS.has(kind)) continue
    if (!allowSpecialBlocks) return refuse('This document type does not keep front matter or an HTML header, so the change cannot create one.')
    if (kind !== 'html-preamble') continue
    const html = tr.doc.child(at).textContent
    const leading = splitLeadingHtml(html)
    if (!leading || leading.rest.trim() !== '') {
      return refuse('A header must be HTML blocks only, and this one has other content. Write that content as Markdown blocks after the header.')
    }
    const problem = headerProblem(html, restrictImages)
    if (problem) return refuse(problem)
  }
  if (index === 0 && !deleting && kindOf(tr.doc.child(0), 0, tr.doc) === 'metadata' && tr.doc.child(0).textContent.trim() === '') {
    return refuse('The front matter has no keys. Write at least one key: value line, or delete the metadata block.')
  }
  if (firstEditableOf(tr.doc) >= tr.doc.childCount) {
    return refuse('That change would leave no body block after the metadata and HTML-preamble blocks.')
  }
  const metadataRemoved = count > 0 && index === 0 && kindOf(state.doc.child(0), 0, state.doc) === 'metadata' &&
    kindOf(tr.doc.child(0), 0, tr.doc) !== 'metadata'

  const adjacent = (at) => at > 0 && at < tr.doc.childCount &&
    LIST_TYPES.has(tr.doc.child(at).type.name) && tr.doc.child(at).type === tr.doc.child(at - 1).type
  if (adjacent(index) || adjacent(index + newCount)) {
    importWarnings.push('Two lists of the same type are now next to each other; they will merge into one list when the document is saved and reopened, which shifts later block indices.')
  }
  const blocks = newCount > 0 ? describeBlocks(tr.doc, { from: index, to: index + newCount }).blocks : []
  return { ok: true, tr, range: { index, count: newCount }, blocks, warnings: importWarnings, ...(metadataRemoved && { metadataRemoved }) }
}

/**
 * Replace, insert or delete top-level blocks of the active editor's document; see planReplace. Thin MU-facing
 * wrapper: it never throws across the JS/Swift bridge, and answers a missing view or any failure with a refusal.
 *
 * @returns {string} JSON: `{ok: false, reason, blocks?}` or `{ok: true, range, blocks, warnings, metadataRemoved?}`
 */
export function replaceBlocks(index, count, markdown, expected, allowLoss, restrictImages, allowSpecialBlocks) {
  const view = MU.activeView()
  if (!view) return JSON.stringify({ ok: false, reason: 'No active view' })
  try {
    const plan = planReplace(view.state, { index, count, markdown, expected, allowLoss, restrictImages, allowSpecialBlocks })
    if (!plan.ok) return JSON.stringify(plan)
    view.dispatch(plan.tr)
    // End the undo event here so typing straight after the change does not join it.
    view.dispatch(view.state.tr.setMeta(CLOSE_HISTORY, true))
    view.dom.dispatchEvent(new Event("input", { bubbles: true }))
    // The editor reports edits to its host on DOM input events, which a dispatched transaction does not raise.
    return JSON.stringify({ ok: true, range: plan.range, blocks: plan.blocks, warnings: plan.warnings, metadataRemoved: plan.metadataRemoved })
  } catch (error) {
    return JSON.stringify({ ok: false, reason: `replaceBlocks failed: ${error.message}` })
  }
}
