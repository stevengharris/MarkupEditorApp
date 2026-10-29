import { describeBlocks, firstEditableOf } from './doc-blocks.js'

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
