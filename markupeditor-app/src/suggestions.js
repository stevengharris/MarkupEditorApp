import { Plugin, PluginKey } from 'markupeditor'
import { describeBlocks, firstEditableOf } from './doc-blocks.js'
import { blockIndexForPos } from './blocks.js'

// Stands in for each non-text inline node (image, line break) so string offsets stay equal to positions.
const LEAF = '￼'

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)

/** Absolute start position of each top-level block of `doc`. */
function blockStarts(doc) {
  const starts = []
  doc.forEach((_node, offset) => starts.push(offset))
  return starts
}

/**
 * Find `find` in the rendered text of top-level block `blockIndex` of `doc`.
 *
 * Matching is exact and case-sensitive (an edit must be precise; select-text.js's findText is
 * case-insensitive and is not reused). A match lies inside one textblock, so it never spans two list items
 * or two table cells. Descendants of a list, quote or table count. Matches within a textblock do not
 * overlap. Positions are absolute in `doc`, and offsets after an inline image or hard break stay positions.
 *
 * Pure: reads `doc` and nothing else. A bad block index or an empty or non-string needle finds nothing.
 *
 * @param {object} doc - ProseMirror doc Node
 * @param {number} blockIndex - index of a top-level block
 * @param {string} find
 * @returns {{matches: {from: number, to: number}[]}}
 */
export function findInBlock(doc, blockIndex, find) {
  const matches = []
  if (typeof find !== 'string' || find === '') return { matches }
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= doc.childCount) return { matches }
  const start = blockStarts(doc)[blockIndex]
  const block = doc.child(blockIndex)
  doc.nodesBetween(start, start + block.nodeSize, (node, pos) => {
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, '', LEAF)
    let at = text.indexOf(find)
    while (at !== -1) {
      matches.push({ from: pos + 1 + at, to: pos + 1 + at + find.length })
      at = text.indexOf(find, at + find.length)
    }
    return false
  })
  return { matches }
}

const overlaps = (a, b) => a.from < b.to && b.from < a.to

/**
 * Judge one edit against `state`'s document. Returns `{reason}` for a refusal, or `{proposal}`.
 */
function judge(state, edit, taken) {
  const doc = state.doc
  if (!isObject(edit)) return { reason: 'each edit must be an object with block, expected, find and replace' }

  const { block, expected, find, replace, note } = edit
  if (!Number.isInteger(block) || block < 0 || block >= doc.childCount) {
    return { reason: `block must be an integer from 0 to ${doc.childCount - 1}` }
  }
  const firstEditable = firstEditableOf(doc)
  if (block < firstEditable) {
    return { reason: `block ${block} is a metadata or HTML-preamble block and cannot be edited; firstEditable is ${firstEditable}` }
  }
  const described = describeBlocks(doc, { from: block, to: block + 1 }).blocks[0]
  if (described.kind === 'code') {
    return { reason: `block ${block} is a code block; suggestions are for prose` }
  }
  if (typeof expected !== 'string') {
    return { reason: 'expected must be a string: the hash of the block as get_document returned it' }
  }
  if (expected !== described.hash) {
    return { reason: `document changed: block ${block} no longer matches the expected hash; read it again` }
  }
  if (typeof find !== 'string' || find === '') return { reason: 'find must be a non-empty string' }
  if (typeof replace !== 'string') return { reason: 'replace must be a string (an empty string deletes the text)' }
  if (note !== undefined && typeof note !== 'string') return { reason: 'note must be a string when present' }

  const { matches } = findInBlock(doc, block, find)
  if (matches.length === 0) return { reason: `find not found in block ${block}; matching is exact and case-sensitive within one paragraph, list item or table cell` }
  if (matches.length > 1) return { reason: `find occurs ${matches.length} times in block ${block}; include more surrounding text so it matches once` }
  if (replace === find) return { reason: 'replace is the same as find; that edit is a no-op' }

  const { from, to } = matches[0]
  let leaf = false
  doc.nodesBetween(from, to, (node) => { if (node.isInline && !node.isText) leaf = true })
  if (leaf) return { reason: 'the range contains an image or hard break, which the edit would delete; choose text that excludes it' }

  const clash = taken.some(other => overlaps({ from, to }, other))
  if (clash) return { reason: 'the range overlaps a pending suggestion; resolve that one first' }

  const marks = doc.nodeAt(from)?.marks ?? []
  return { proposal: { block, from, to, find, replace, note, marks } }
}

/**
 * Plan suggestions for `edits` against `state`, without changing anything.
 *
 * Each edit is `{block, expected, find, replace, note?}`: `find` is replaced by `replace` at the one place it
 * occurs in the top-level block `block`, provided the block still hashes to `expected` (the hash get_document
 * returned). Each edit is judged alone, so some may be proposed while others are refused. An edit is also
 * refused when its range overlaps a suggestion in `pending` or one proposed earlier in the same batch;
 * ranges that only touch are allowed.
 *
 * Pure and never throws: bad input becomes a refusal. The returned `proposals` are what the plugin adds
 * (with their ids), in the order of the `proposed` results; each `marks` is the marks of the range's first
 * character, which a replacement inherits.
 *
 * @param {object} state - EditorState
 * @param {object[]} edits
 * @param {{from: number, to: number}[]} pending - suggestions already pending, for the overlap check
 * @returns {{results: object[], proposals: object[]}} A result is `{index, status: 'proposed', block}` or
 *   `{index, status: 'refused', reason}`.
 */
export function planProposals(state, edits, pending) {
  const results = []
  const proposals = []
  if (!Array.isArray(edits)) return { results, proposals }
  const taken = Array.isArray(pending) ? [...pending] : []
  edits.forEach((edit, index) => {
    let judged
    try {
      judged = judge(state, edit, taken)
    } catch (error) {
      judged = { reason: `the edit could not be planned: ${error.message}` }
    }
    if (judged.proposal) {
      proposals.push(judged.proposal)
      taken.push(judged.proposal)
      results.push({ index, status: 'proposed', block: judged.proposal.block })
    } else {
      results.push({ index, status: 'refused', reason: judged.reason })
    }
  })
  return { results, proposals }
}

// ---------------------------------------------------------------------------
// Plugin state
// ---------------------------------------------------------------------------

/**
 * Key of the suggestions plugin. A transaction steers the plugin with meta under this key:
 * `{add: proposals}`, `{accepted: ids}` or `{rejected: ids}`.
 */
export const suggestionsKey = new PluginKey('suggestions')

const emptyState = () => ({ pending: [], resolved: [], nextId: 1 })

/** The record kept for a suggestion that is no longer pending. */
function resolvedRecord(suggestion, block, status, reason) {
  const record = { id: suggestion.id, status, find: suggestion.find, replace: suggestion.replace, block }
  if (suggestion.note !== undefined) record.note = suggestion.note
  if (reason) record.reason = reason
  return record
}

/**
 * Does `tr` replace the whole document? That is what MU.setHTML dispatches for open, new document and the
 * source-view toggle: AllSelection, replaceSelectionWith, and addToHistory false because history begins
 * there. A step replacing everything is not enough by itself: a user who selects all and types does that
 * too, and that is an edit. Transactions that only steer this plugin never count.
 */
function replacesWholeDocument(tr) {
  if (!tr.docChanged || tr.getMeta('addToHistory') !== false) return false
  return tr.steps.some((step, i) => {
    let whole = false
    step.getMap().forEach((oldStart, oldEnd) => {
      if (oldStart <= 0 && oldEnd >= tr.docs[i].content.size) whole = true
    })
    return whole
  })
}

/**
 * Advance the suggestions state through `tr`.
 *
 * A pending range is mapped with `from` sticking to the text after it (assoc 1) and `to` to the text before
 * it (assoc -1), so an insertion exactly at either boundary lands outside the range. It goes stale, with
 * reason 'edited', when it collapses or its text is no longer `find`; a whole-document replacement makes every
 * pending suggestion stale with reason 'document-replaced'. Stale suggestions are kept as resolved records.
 * Ids named by `accepted` or `rejected` meta move to resolved without being mapped. The `block` of a
 * resolved record is the block the range was in just before the transaction.
 */
function applySuggestions(tr, value, oldState, newState) {
  const meta = tr.getMeta(suggestionsKey) ?? {}
  const accepted = new Set(meta.accepted ?? [])
  const rejected = new Set(meta.rejected ?? [])
  const add = meta.add ?? []
  if (!tr.docChanged && add.length === 0 && accepted.size === 0 && rejected.size === 0) return value

  const wholesale = replacesWholeDocument(tr)
  const pending = []
  const resolved = [...value.resolved]
  for (const s of value.pending) {
    const resolve = (status, reason) => resolved.push(resolvedRecord(s, blockIndexForPos(oldState.doc, s.from), status, reason))
    if (accepted.has(s.id)) { resolve('accepted'); continue }
    if (rejected.has(s.id)) { resolve('rejected'); continue }
    if (!tr.docChanged) { pending.push(s); continue }
    if (wholesale) { resolve('stale', 'document-replaced'); continue }
    const from = tr.mapping.map(s.from, 1)
    const to = tr.mapping.map(s.to, -1)
    if (from >= to || newState.doc.textBetween(from, to, '', LEAF) !== s.find) { resolve('stale', 'edited'); continue }
    pending.push({ ...s, from, to })
  }
  let nextId = value.nextId
  for (const proposal of add) pending.push({ ...proposal, id: `s${nextId++}` })
  return { pending, resolved, nextId }
}

/**
 * The suggestions plugin: holds the pending suggestions and the records of resolved ones. Ids are "s1", "s2",
 * ... and are monotonic per plugin instance.
 *
 * @returns {Plugin}
 */
export function suggestionsPlugin() {
  return new Plugin({
    key: suggestionsKey,
    state: {
      init: emptyState,
      apply: applySuggestions,
    },
  })
}

/**
 * The suggestions held by `state`'s plugin: `{pending, resolved}`. A pending suggestion is
 * `{id, from, to, find, replace, note, block, marks}` with `block` recomputed from where its range now is; a
 * resolved one is `{id, status, find, replace, note?, block, reason?}`. Empty when the plugin is absent.
 *
 * @param {object} state - EditorState
 */
export function getSuggestions(state) {
  const value = suggestionsKey.getState(state) ?? emptyState()
  return {
    pending: value.pending.map(s => ({ ...s, block: blockIndexForPos(state.doc, s.from) })),
    resolved: value.resolved,
  }
}
