import { MU, Plugin, PluginKey, TextSelection, Decoration, DecorationSet } from 'markupeditor'
import { describeBlocks, firstEditableOf, hashMarkdown } from './doc-blocks.js'
import { blockIndexForPos } from './blocks.js'

// Stands in for each non-text inline node (image, line break) so string offsets stay equal to positions.
const LEAF = '\uFFFC'

// The meta key prosemirror-history reads to end the current undo event, so an accept is not undone together
// with the user's typing before it, nor typing right after it with the accept (see replace-blocks.js).
const CLOSE_HISTORY = 'closeHistory$'

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
 * or two table cells. Descendants of a list, quote or table count, except code blocks (also those nested in a
 * list or quote), which suggestions never touch unless `includeCode` is set. Matches within a textblock do not
 * overlap. Positions are absolute in `doc`, and offsets after an inline image or hard break stay positions.
 *
 * Pure: reads `doc` and nothing else. A bad block index or an empty or non-string needle finds nothing.
 *
 * @param {object} doc - ProseMirror doc Node
 * @param {number} blockIndex - index of a top-level block
 * @param {string} find
 * @param {{includeCode?: boolean}} [options] - `includeCode` also searches code blocks
 * @returns {{matches: {from: number, to: number}[]}}
 */
export function findInBlock(doc, blockIndex, find, { includeCode = false } = {}) {
  const matches = []
  if (typeof find !== 'string' || find === '') return { matches }
  if (!Number.isInteger(blockIndex) || blockIndex < 0 || blockIndex >= doc.childCount) return { matches }
  const start = blockStarts(doc)[blockIndex]
  const block = doc.child(blockIndex)
  doc.nodesBetween(start, start + block.nodeSize, (node, pos) => {
    if (!node.isTextblock) return true
    if (node.type.name === 'code_block' && !includeCode) return false
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

// Line breaks and the other control characters (C0, DEL, C1, and the Unicode line and paragraph separators).
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/
const MAX_TEXT_LENGTH = 2000

const overlaps = (a, b) => a.from < b.to && b.from < a.to

const sameMarks = (a, b) => a.length === b.length && a.every(mark => mark.isInSet(b))

/**
 * Does the range hold text with differing mark sets? Accepting gives the replacement the marks of the range's
 * first character, so a range across a formatting boundary would silently flatten the rest.
 */
function crossesFormatting(doc, from, to) {
  let first = null
  let crosses = false
  doc.nodesBetween(from, to, (node) => {
    if (!node.isText) return true
    if (first === null) first = node.marks
    else if (!sameMarks(first, node.marks)) crosses = true
    return false
  })
  return crosses
}

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
  for (const [name, text] of [['replace', replace], ['note', note]]) {
    if (text === undefined) continue
    if (CONTROL_CHARACTERS.test(text)) {
      return { reason: `${name} must not contain line breaks or other control characters; it is one run of text inside a paragraph` }
    }
    if (text.length > MAX_TEXT_LENGTH) return { reason: `${name} must be at most ${MAX_TEXT_LENGTH} characters` }
  }

  const { matches } = findInBlock(doc, block, find)
  if (matches.length === 0) {
    if (findInBlock(doc, block, find, { includeCode: true }).matches.length > 0) {
      return { reason: `find occurs in block ${block} only inside a code block; suggestions are for prose` }
    }
    return {
      reason: `find not found in block ${block}; matching is exact and case-sensitive against the visible text of one paragraph, `
        + 'list item or table cell, without Markdown syntax (leave out ** _ ` ~~ [ ]( ) ![]( ) # list markers and backslash escapes; '
        + 'inline code matches without its backticks)',
    }
  }
  if (matches.length > 1) return { reason: `find occurs ${matches.length} times in block ${block}; include more surrounding text so it matches once` }
  if (replace === find) return { reason: 'replace is the same as find; that edit is a no-op' }

  const { from, to } = matches[0]
  let leaf = false
  doc.nodesBetween(from, to, (node) => { if (node.isInline && !node.isText) leaf = true })
  if (leaf) return { reason: 'the range contains an image or hard break, which the edit would delete; choose text that excludes it' }

  if (crossesFormatting(doc, from, to)) {
    return {
      reason: 'find crosses a formatting boundary (bold, code, link...); split the edit so each part lies inside one run of formatting',
    }
  }

  const clash = taken.some(other => overlaps({ from, to }, other))
  if (clash) return { reason: 'the range overlaps a pending suggestion; resolve that one first' }

  return { proposal: { block, from, to, find, replace, note } }
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
 * A `find` must lie in one run of formatting (the same marks throughout): the replacement takes that run's
 * marks, so a range across a boundary is refused rather than flattened.
 *
 * Pure and never throws: bad input becomes a refusal. The returned `proposals` are what the plugin adds
 * (with their ids), in the order of the `proposed` results. They carry no marks: a replacement inherits the
 * marks of the range's first character, read from the document when it is accepted.
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
 * `{add: proposals}`, `{accepted: ids}`, `{rejected: ids}` or `{stale: ids}`.
 */
export const suggestionsKey = new PluginKey('suggestions')

/**
 * The rendered text of `doc` between `from` and `to`, as findInBlock sees it: a non-text inline node and a
 * boundary between two textblocks both read as LEAF. The block separator must not be empty: a paragraph split
 * inside a range would otherwise leave its text equal to `find`.
 */
const textOfRange = (doc, from, to) => doc.textBetween(from, to, LEAF, LEAF)

/**
 * Is `s` still over exactly the text it was proposed for in `doc`, in one run of formatting? A range that has
 * since picked up a formatting boundary (the user bolded part of it) would be flattened by accepting, which
 * is what the propose-time refusal prevents, so it no longer holds.
 */
const holdsFind = (doc, s) => s.from < s.to && s.to <= doc.content.size
  && textOfRange(doc, s.from, s.to) === s.find && !crossesFormatting(doc, s.from, s.to)

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
 * reason 'edited', when it collapses, its text is no longer `find`, or it crosses a formatting boundary (a
 * mark change over part of the range); a whole-document replacement makes every
 * pending suggestion stale with reason 'document-replaced'. Stale suggestions are kept as resolved records.
 * Ids named by `accepted`, `rejected` or `stale` meta move to resolved without being mapped (`stale` records
 * reason 'edited'). The `block` of a
 * resolved record is the block the range was in just before the transaction.
 */
function applySuggestions(tr, value, oldState, newState) {
  const meta = tr.getMeta(suggestionsKey) ?? {}
  const accepted = new Set(meta.accepted ?? [])
  const rejected = new Set(meta.rejected ?? [])
  const staled = new Set(meta.stale ?? [])
  const add = meta.add ?? []
  if (!tr.docChanged && add.length === 0 && accepted.size === 0 && rejected.size === 0 && staled.size === 0) return value

  const wholesale = replacesWholeDocument(tr)
  const pending = []
  const resolved = [...value.resolved]
  for (const s of value.pending) {
    const resolve = (status, reason) => resolved.push(resolvedRecord(s, blockIndexForPos(oldState.doc, s.from), status, reason))
    if (accepted.has(s.id)) { resolve('accepted'); continue }
    if (rejected.has(s.id)) { resolve('rejected'); continue }
    if (staled.has(s.id)) { resolve('stale', 'edited'); continue }
    if (!tr.docChanged) { pending.push(s); continue }
    if (wholesale) { resolve('stale', 'document-replaced'); continue }
    const from = tr.mapping.map(s.from, 1)
    const to = tr.mapping.map(s.to, -1)
    if (!holdsFind(newState.doc, { ...s, from, to })) { resolve('stale', 'edited'); continue }
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
    props: {
      decorations(state) {
        return suggestionDecorations(state)
      },
    },
  })
}

/**
 * The suggestions held by `state`'s plugin: `{pending, resolved}`. A pending suggestion is
 * `{id, from, to, find, replace, note, block}` with `block` recomputed from where its range now is; a
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

// ---------------------------------------------------------------------------
// Accept, reject, navigate
// ---------------------------------------------------------------------------

/**
 * Sort `ids` (an array, possibly with repeats) into the pending suggestions of `view`'s state and those that
 * cannot be acted on, each skipped one with the reason.
 */
function sortIds(state, ids) {
  const { pending, resolved } = getSuggestions(state)
  const chosen = []
  const skipped = []
  const seen = new Set()
  for (const id of Array.isArray(ids) ? ids : []) {
    if (seen.has(id)) continue
    seen.add(id)
    const live = pending.find(s => s.id === id)
    if (live) { chosen.push(live); continue }
    const done = resolved.find(r => r.id === id)
    skipped.push({ id, reason: done ? `suggestion ${id} is ${done.status}` : `unknown suggestion ${id}` })
  }
  return { chosen, skipped }
}

/**
 * Accept the pending suggestions named by `ids`: each range gets its replacement text, in ONE transaction and
 * so one undo step. A replacement carries the marks of the first character it replaces (read from the
 * document as it is now); an empty replacement deletes. Ids that are unknown, already resolved or stale are
 * skipped and reported, and change nothing. A pending one whose range no longer holds its `find` text, or now
 * crosses a formatting boundary, is recorded as stale ('edited') and skipped too. The caret ends after the last replacement.
 *
 * The change carries closeHistory$, and a second transaction closes the undo event after it, so typing next to
 * it does not join it. The host marks the document edited on DOM input events, which a dispatched
 * transaction does not raise, so one is dispatched, as replaceBlocks does.
 *
 * Undoing the accept restores the text; the record stays 'accepted'.
 *
 * @param {object} view - EditorView
 * @param {string[]} ids
 * @returns {{accepted: string[], skipped: {id: string, reason: string}[]}}
 */
export function acceptSuggestions(view, ids) {
  const sorted = sortIds(view.state, ids)
  const skipped = sorted.skipped
  // Belt and braces: the plugin already makes an edited range stale, but a range whose text is not `find`
  // must never be replaced, so it is recorded as stale ('edited') and skipped.
  const chosen = sorted.chosen.filter(s => holdsFind(view.state.doc, s))
  const changed = sorted.chosen.filter(s => !chosen.includes(s))
  for (const s of changed) skipped.push({ id: s.id, reason: `suggestion ${s.id} is stale: the text in its range is no longer what it replaces` })
  if (changed.length > 0) {
    view.dispatch(view.state.tr.setMeta('addToHistory', false).setMeta(suggestionsKey, { stale: changed.map(s => s.id) }))
  }
  if (chosen.length === 0) return { accepted: [], skipped }

  const state = view.state
  const byPosition = [...chosen].sort((a, b) => a.from - b.from)
  const tr = state.tr
  // From the last range to the first, so each replacement leaves the positions of those before it alone.
  for (const s of [...byPosition].reverse()) {
    if (s.replace === '') tr.delete(s.from, s.to)
    else tr.replaceWith(s.from, s.to, state.schema.text(s.replace, state.doc.nodeAt(s.from)?.marks ?? []))
  }
  const last = byPosition[byPosition.length - 1]
  // Just after the last range's replacement: where step 0 left it, moved by the steps for the ranges before it.
  const caret = tr.mapping.slice(1).map(last.from + last.replace.length, 1)
  tr.setSelection(TextSelection.near(tr.doc.resolve(caret), -1))
  tr.setMeta(CLOSE_HISTORY, true)
  tr.setMeta(suggestionsKey, { accepted: chosen.map(s => s.id) })
  view.dispatch(tr)
  view.dispatch(view.state.tr.setMeta(CLOSE_HISTORY, true))
  view.dom.dispatchEvent(new Event('input', { bubbles: true }))
  return { accepted: chosen.map(s => s.id), skipped }
}

/**
 * Reject the pending suggestions named by `ids`: they are recorded as rejected and nothing else changes. The
 * transaction carries only meta and stays out of the undo history, and no input event is raised, because
 * rejecting does not edit the document.
 *
 * @param {object} view - EditorView
 * @param {string[]} ids
 * @returns {{rejected: string[], skipped: {id: string, reason: string}[]}}
 */
export function rejectSuggestions(view, ids) {
  const { chosen, skipped } = sortIds(view.state, ids)
  if (chosen.length === 0) return { rejected: [], skipped }
  const rejected = chosen.map(s => s.id)
  view.dispatch(view.state.tr.setMeta('addToHistory', false).setMeta(suggestionsKey, { rejected }))
  return { rejected, skipped }
}

/**
 * The pending suggestion to visit from the selection: for 'next' the first whose start is at or after the start
 * of the selection, for 'previous' the last whose start is at or before it, wrapping round when there is none.
 * Null when nothing is pending. The one suggestion skipped is the one whose range the selection exactly covers,
 * which is the one just visited; a suggestion starting at a collapsed caret is not skipped.
 *
 * @param {object} state - EditorState
 * @param {'next'|'previous'} direction
 * @returns {object|null} a pending suggestion
 */
export function nextSuggestionTarget(state, direction) {
  const pending = [...getSuggestions(state).pending].sort((a, b) => a.from - b.from)
  if (pending.length === 0) return null
  const { from: at, to: selectedTo } = state.selection
  // The suggestion just visited has the selection exactly over its range; any other one starting at the
  // selection's start, a collapsed caret included, has not been visited.
  const visited = (s) => s.from === at && s.to === selectedTo
  if (direction === 'previous') {
    return [...pending].reverse().find(s => s.from <= at && !visited(s)) ?? pending[pending.length - 1]
  }
  return pending.find(s => s.from >= at && !visited(s)) ?? pending[0]
}

/**
 * Select the range of the next or previous pending suggestion and scroll it into view.
 *
 * @param {object} view - EditorView
 * @param {'next'|'previous'} direction
 * @returns {{found: boolean, id?: string, block?: number}}
 */
export function goToSuggestion(view, direction) {
  const target = nextSuggestionTarget(view.state, direction)
  if (!target) return { found: false }
  const selection = TextSelection.create(view.state.doc, target.from, target.to)
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView())
  return { found: true, id: target.id, block: target.block }
}

// ---------------------------------------------------------------------------
// Decorations and widgets
// ---------------------------------------------------------------------------

/**
 * The widget that sits after a struck-out range: the replacement text and Accept and Reject buttons.
 *
 * The replacement and the note come from an assistant and may be hostile, so every piece of text reaches the
 * DOM through textContent or setAttribute, never as markup. The widget is not editable. A mousedown on a
 * button is default-prevented so the editor keeps its selection; a click accepts or rejects that one
 * suggestion through `view`.
 *
 * @param {{id: string, replace: string, note?: string}} suggestion
 * @param {object} view - EditorView
 * @returns {HTMLElement}
 */
export function buildWidget(suggestion, view) {
  const widget = document.createElement('span')
  widget.className = 'suggestion-new'
  widget.setAttribute('contenteditable', 'false')
  if (suggestion.note) widget.setAttribute('title', suggestion.note)
  if (suggestion.replace === '') {
    const marker = document.createElement('span')
    marker.className = 'suggestion-delete'
    marker.textContent = '(delete)'
    widget.appendChild(marker)
  } else {
    widget.appendChild(document.createTextNode(suggestion.replace))
  }
  const button = (label, className, act) => {
    const element = document.createElement('button')
    element.setAttribute('type', 'button')
    element.className = className
    element.setAttribute('aria-label', `${label} suggestion`)
    element.textContent = label
    element.addEventListener('mousedown', (event) => event.preventDefault())
    element.addEventListener('click', (event) => {
      event.preventDefault()
      act(view, [suggestion.id])
    })
    return element
  }
  widget.appendChild(button('Accept', 'suggestion-accept', acceptSuggestions))
  widget.appendChild(button('Reject', 'suggestion-reject', rejectSuggestions))
  return widget
}

/** The decorations for the pending suggestions: the old text struck through, the widget after it. */
function suggestionDecorations(state) {
  const { pending } = suggestionsKey.getState(state) ?? emptyState()
  if (pending.length === 0) return DecorationSet.empty
  const decorations = []
  for (const s of pending) {
    const attrs = { class: 'suggestion-old', 'data-suggestion-id': s.id }
    if (s.note) attrs.title = s.note
    decorations.push(Decoration.inline(s.from, s.to, attrs))
    decorations.push(Decoration.widget(s.to, (view) => buildWidget(s, view), {
      side: 1,
      key: `suggestion-${s.id}:${hashMarkdown(s.replace)}`,
      stopEvent: () => true,
      ignoreSelection: true,
    }))
  }
  return DecorationSet.create(state.doc, decorations)
}

// ---------------------------------------------------------------------------
// The MU surface
// ---------------------------------------------------------------------------

const MAX_EDITS = 200

/**
 * Add the suggestions plugin to `view` if it does not have it. Safe to call repeatedly. Reconfiguring keeps the
 * state of the plugins already there, history included.
 *
 * @param {object} view - EditorView
 */
export function ensureInstalled(view) {
  if (suggestionsKey.get(view.state)) return
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, suggestionsPlugin()] }))
}

/**
 * Wrap `run(view, ...args)` as an MU-facing function: it finds the active view, answers JSON, and turns a
 * missing view or any exception into `{ok: false, reason}`, so nothing throws across the JS/Swift bridge.
 */
function bridge(name, run) {
  return (...args) => {
    const view = MU.activeView()
    if (!view) return JSON.stringify({ ok: false, reason: 'No active view' })
    try {
      return JSON.stringify(run(view, ...args))
    } catch (error) {
      return JSON.stringify({ ok: false, reason: `${name} failed: ${error.message}` })
    }
  }
}

/**
 * Propose edits as suggestions in the active editor: see planProposals for the edit shape and the refusals.
 * Nothing in the document changes, nothing enters the undo history, and the host is not told the document was
 * edited. Installs the plugin when the first suggestion is proposed.
 *
 * @param {object[]} edits - 1 to 200 `{block, expected, find, replace, note?}`
 * @returns {string} JSON: `{ok: true, results}` where a result is `{index, status: 'proposed', id, block}` or
 *   `{index, status: 'refused', reason}`; or `{ok: false, reason}`
 */
export const proposeEdits = bridge('proposeEdits', (view, edits) => {
  if (!Array.isArray(edits) || edits.length < 1 || edits.length > MAX_EDITS) {
    return { ok: false, reason: `edits must be an array of 1 to ${MAX_EDITS} edits` }
  }
  const { results, proposals } = planProposals(view.state, edits, getSuggestions(view.state).pending)
  if (proposals.length > 0) {
    ensureInstalled(view)
    // Ids are handed out in order, so the proposed results take them in the same order.
    let nextId = suggestionsKey.getState(view.state).nextId
    for (const result of results) if (result.status === 'proposed') result.id = `s${nextId++}`
    view.dispatch(view.state.tr.setMeta('addToHistory', false).setMeta(suggestionsKey, { add: proposals }))
  }
  return { ok: true, results }
})

/**
 * Every suggestion, pending and resolved, in creation order.
 *
 * @returns {string} JSON: `{ok: true, suggestions: [{id, status, block, find, replace, note?, reason?}]}` where
 *   status is 'pending', 'accepted', 'rejected' or 'stale' and reason ('edited' or 'document-replaced') is
 *   given for stale ones; or `{ok: false, reason}`
 */
export const listSuggestions = bridge('listSuggestions', (view) => {
  const { pending, resolved } = getSuggestions(view.state)
  const entry = (s, status) => {
    const out = { id: s.id, status: s.status ?? status, block: s.block, find: s.find, replace: s.replace }
    if (s.note !== undefined) out.note = s.note
    if (s.reason) out.reason = s.reason
    return out
  }
  const all = [...pending.map(s => entry(s, 'pending')), ...resolved.map(r => entry(r))]
  all.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)))
  return { ok: true, suggestions: all }
})

/** Select the next pending suggestion. @returns {string} JSON: `{ok: true, found, id?, block?}` */
export const nextSuggestion = bridge('nextSuggestion', (view) => ({ ok: true, ...goToSuggestion(view, 'next') }))

/** Select the previous pending suggestion. @returns {string} JSON: `{ok: true, found, id?, block?}` */
export const previousSuggestion = bridge('previousSuggestion', (view) => ({ ok: true, ...goToSuggestion(view, 'previous') }))

/** Accept every pending suggestion in one undo step. @returns {string} JSON: `{ok: true, count}` */
export const acceptAllSuggestions = bridge('acceptAllSuggestions', (view) => {
  const ids = getSuggestions(view.state).pending.map(s => s.id)
  return { ok: true, count: acceptSuggestions(view, ids).accepted.length }
})

/** Reject every pending suggestion. @returns {string} JSON: `{ok: true, count}` */
export const rejectAllSuggestions = bridge('rejectAllSuggestions', (view) => {
  const ids = getSuggestions(view.state).pending.map(s => s.id)
  return { ok: true, count: rejectSuggestions(view, ids).rejected.length }
})
