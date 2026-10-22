import { MU } from 'markupeditor'
import { makeParser } from './parser.js'
import { makeWarnings } from './warnings.js'
import { describeBlocks, firstEditableOf } from './doc-blocks.js'
import { applyImagePolicy } from './image-policy.js'

// The meta key prosemirror-history reads to end the current undo event, so the change is not undone together
// with the user's typing before it, nor typing right after it with the change. The editor's copy of the
// history module creates this key first, which gives it this name; if it were ever different, setting it
// would do nothing and a change could join a neighboring undo event, not break anything else.
const CLOSE_HISTORY = 'closeHistory$'

// A fragment that opens like YAML front matter would be read as a rule and a heading.
const FRONT_MATTER = /^\s*---[ \t]*\n[ \t]*[A-Za-z_][\w-]*[ \t]*:[\s\S]*?\n---[ \t]*(\n|$)/

const LIST_TYPES = new Set(['bullet_list', 'ordered_list'])

const refuse = (reason, blocks) => (blocks ? { ok: false, reason, blocks } : { ok: false, reason })

/**
 * Plan a change to the top-level blocks of `state`'s document, without applying it.
 *
 * Replaces `count` blocks starting at `index` with the blocks in `markdown`, which is imported with the
 * Markdown parser alone. `count` 0 inserts before block `index` (an `index` equal to the number of blocks
 * appends); an empty `markdown` with `count` above 0 deletes. Block types come from the Markdown.
 *
 * `expected` guards against a stale read: for `count` above 0, the hashes of the blocks being replaced as they
 * were read; for `count` 0, the hash of the block just before `index`, or none when `index` is `firstEditable`.
 * Nothing changes when any differs, and the reply carries the current blocks. A block whose Markdown could not
 * hold something it holds (it has export warnings) is replaced only when `allowLoss` is true.
 *
 * Arguments are validated, not clamped. The change is one transaction.
 *
 * @param {object} state - EditorState
 * @param {{index: number, count: number, markdown: string, expected: string[], allowLoss?: boolean}} args
 * @returns {object} `{ok: false, reason, blocks?}`, or `{ok: true, tr, range: {index, count}, blocks, warnings}`
 *   where `blocks` are the new blocks and `warnings` are the import's.
 */
export function planReplace(state, { index, count, markdown, expected, allowLoss }) {
  const total = state.doc.childCount
  const firstEditable = firstEditableOf(state.doc)
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
  if (index < firstEditable) {
    return refuse(`blocks before index ${firstEditable} (the metadata and HTML-preamble blocks) cannot be replaced or inserted before; firstEditable is ${firstEditable}`)
  }
  if (deleting && count === total) {
    return refuse('that would delete every block; the document keeps at least one block')
  }

  const hashesNeeded = count > 0 ? count : (index === firstEditable ? 0 : 1)
  if (!Array.isArray(expected) || expected.length !== hashesNeeded || !expected.every(h => typeof h === 'string')) {
    const what = count > 0 ? `the hashes of the ${count} block${count === 1 ? '' : 's'} being replaced`
      : (hashesNeeded === 0 ? 'no hashes (an insert at firstEditable)' : 'the hash of the block just before index')
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

  if (!deleting && FRONT_MATTER.test(markdown.replace(/\r\n/g, '\n'))) {
    return refuse('The Markdown opens like front matter (--- then key: lines then ---). Front matter cannot be created or changed with this tool.')
  }

  const warnings = makeWarnings()
  let fragment
  if (!deleting) {
    try {
      fragment = makeParser(state.schema, warnings).parse(markdown.replace(/\r\n/g, '\n'))
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
    const applied = applyImagePolicy(fragment, state.schema, keepSrcs)
    fragment = applied.fragment
    importWarnings.push(...applied.warnings)
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

  // The metadata and HTML-preamble blocks are special only at the start of the document; the change must
  // neither create, remove nor promote one, and must leave something editable.
  const afterEditable = firstEditableOf(tr.doc)
  if (afterEditable !== firstEditable || afterEditable >= tr.doc.childCount) {
    return refuse('That change would alter the metadata or HTML-preamble blocks at the start of the document (a fenced metadata or html block there is reserved for them), or leave no editable block.')
  }

  const newCount = deleting ? 0 : fragment.childCount
  const adjacent = (at) => at > 0 && at < tr.doc.childCount &&
    LIST_TYPES.has(tr.doc.child(at).type.name) && tr.doc.child(at).type === tr.doc.child(at - 1).type
  if (adjacent(index) || adjacent(index + newCount)) {
    importWarnings.push('Two lists of the same type are now next to each other; they will merge into one list when the document is saved and reopened, which shifts later block indices.')
  }
  const blocks = newCount > 0 ? describeBlocks(tr.doc, { from: index, to: index + newCount }).blocks : []
  return { ok: true, tr, range: { index, count: newCount }, blocks, warnings: importWarnings }
}

/**
 * Replace, insert or delete top-level blocks of the active editor's document; see planReplace. Thin MU-facing
 * wrapper: it never throws across the JS/Swift bridge, and answers a missing view or any failure with a refusal.
 *
 * @returns {string} JSON: `{ok: false, reason, blocks?}` or `{ok: true, range, blocks, warnings}`
 */
export function replaceBlocks(index, count, markdown, expected, allowLoss) {
  const view = MU.activeView()
  if (!view) return JSON.stringify({ ok: false, reason: 'No active view' })
  try {
    const plan = planReplace(view.state, { index, count, markdown, expected, allowLoss })
    if (!plan.ok) return JSON.stringify(plan)
    view.dispatch(plan.tr)
    // End the undo event here so typing straight after the change does not join it.
    view.dispatch(view.state.tr.setMeta(CLOSE_HISTORY, true))
    view.dom.dispatchEvent(new Event("input", { bubbles: true }))
    // The editor reports edits to its host on DOM input events, which a dispatched transaction does not raise.
    return JSON.stringify({ ok: true, range: plan.range, blocks: plan.blocks, warnings: plan.warnings })
  } catch (error) {
    return JSON.stringify({ ok: false, reason: `replaceBlocks failed: ${error.message}` })
  }
}
