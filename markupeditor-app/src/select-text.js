import { MU, TextSelection } from 'markupeditor'

// Stands in for each non-text inline node (image, line break) so string offsets stay equal to positions.
const LEAF = '￼'

/**
 * Find the `occurrence`th (1 is first) match of `text` in the rendered text of `doc`, counted from the
 * document start. Matching is case-insensitive, within one text block, and the matches in a block do
 * not overlap.
 *
 * Pure: reads `doc` and nothing else.
 *
 * @param {object} doc - ProseMirror doc Node
 * @param {string} text
 * @param {number} occurrence
 * @returns {{from: number, to: number, blockIndex: number} | null}
 */
export function findText(doc, text, occurrence) {
  if (typeof text !== 'string' || text === '') return null
  // Lowercasing can change a string's length; then compare exactly so offsets stay positions.
  const lower = (s) => { const l = s.toLowerCase(); return l.length === s.length ? l : s }
  const needle = lower(text)
  let seen = 0
  let found = null
  doc.descendants((node, pos) => {
    if (found) return false
    if (!node.isTextblock) return true
    const haystack = lower(node.textBetween(0, node.content.size, '', LEAF))
    let at = haystack.indexOf(needle)
    while (at !== -1) {
      seen++
      if (seen === occurrence) {
        const from = pos + 1 + at
        found = { from, to: from + needle.length, blockIndex: doc.resolve(pos).index(0) }
        return false
      }
      at = haystack.indexOf(needle, at + needle.length)
    }
    return false
  })
  return found
}

/**
 * Select the `occurrence`th match of `text` in the active editor's document and scroll it into view.
 * Nothing changes when there is no match. Never throws across the JS/Swift bridge.
 *
 * @param {string} text
 * @param {number} [occurrence=1]
 * @returns {string} JSON: `{found: true, blockIndex}`, `{found: false}`, or `{found: false, reason}`
 */
export function selectText(text, occurrence = 1) {
  const view = MU.activeView()
  if (!view) return JSON.stringify({ found: false, reason: 'No active view' })
  if (typeof text !== 'string' || text === '') return JSON.stringify({ found: false, reason: 'text must be a non-empty string' })
  if (!Number.isInteger(occurrence) || occurrence < 1) return JSON.stringify({ found: false, reason: 'occurrence must be an integer of 1 or more' })
  try {
    const range = findText(view.state.doc, text, occurrence)
    if (!range) return JSON.stringify({ found: false })
    const selection = TextSelection.create(view.state.doc, range.from, range.to)
    view.dispatch(view.state.tr.setSelection(selection).scrollIntoView())
    return JSON.stringify({ found: true, blockIndex: range.blockIndex })
  } catch (error) {
    return JSON.stringify({ found: false, reason: `selectText failed: ${error.message}` })
  }
}
