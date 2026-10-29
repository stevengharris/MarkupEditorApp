import { describe, test, expect } from 'vitest'
import { MU, EditorState, AllSelection, TextSelection } from 'markupeditor'
import { history, undo, redo, undoDepth } from 'prosemirror-history'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { describeBlocks } from '../src/doc-blocks.js'
import {
  findInBlock, planProposals, suggestionsKey, suggestionsPlugin, getSuggestions,
  acceptSuggestions, rejectSuggestions, nextSuggestionTarget, goToSuggestion,
} from '../src/suggestions.js'

const { schema } = MU

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parse = (md) => makeParser(schema, makeWarnings()).parse(md)
const p = (...parts) => schema.nodes.paragraph.create(null, parts.map(x => (typeof x === 'string' ? schema.text(x) : x)))
const bold = (text) => schema.text(text, [schema.marks.strong.create()])
const codeBlock = (language, text) => schema.nodes.code_block.create({ language }, text ? [schema.text(text)] : [])
const doc = (...children) => schema.nodes.doc.create(null, children)
const stateOf = (document, extra = []) => EditorState.create({ doc: document, plugins: [history(), ...extra] })
const hashOf = (document, index) => describeBlocks(document, { from: index, to: index + 1 }).blocks[0].hash

/** Plan one edit against `document` with the right hash for its block. */
function planOne(document, edit, pending = []) {
  const state = stateOf(document)
  const full = { expected: hashOf(document, edit.block), ...edit }
  const plan = planProposals(state, [full], pending)
  return { plan, result: plan.results[0], state }
}

// ---------------------------------------------------------------------------
// findInBlock
// ---------------------------------------------------------------------------

describe('findInBlock', () => {
  test('finds an exact match with absolute positions that give the text back', () => {
    const document = doc(p('first'), p('the cat sat'))
    const { matches } = findInBlock(document, 1, 'cat')
    expect(matches.length).toBe(1)
    expect(document.textBetween(matches[0].from, matches[0].to)).toBe('cat')
  })

  test('is case-sensitive', () => {
    const document = doc(p('Cat cat CAT'))
    expect(findInBlock(document, 0, 'Cat').matches.length).toBe(1)
    expect(findInBlock(document, 0, 'cat').matches.length).toBe(1)
    expect(findInBlock(document, 0, 'cAt').matches.length).toBe(0)
  })

  test('counts non-overlapping matches only', () => {
    expect(findInBlock(doc(p('aaa')), 0, 'aa').matches.length).toBe(1)
    expect(findInBlock(doc(p('ab ab ab')), 0, 'ab').matches.length).toBe(3)
  })

  test('looks only inside the named top-level block', () => {
    const document = doc(p('cat'), p('dog'))
    expect(findInBlock(document, 1, 'cat').matches).toEqual([])
  })

  test('finds text in a list item and a table cell, and each textblock apart', () => {
    const document = parse('* one fish\n* two fish\n\n| A | B |\n| --- | --- |\n| red fish | blue |')
    const list = findInBlock(document, 0, 'fish')
    expect(list.matches.length).toBe(2)
    list.matches.forEach(m => expect(document.textBetween(m.from, m.to)).toBe('fish'))
    const table = findInBlock(document, 1, 'red fish')
    expect(table.matches.length).toBe(1)
    expect(document.textBetween(table.matches[0].from, table.matches[0].to)).toBe('red fish')
  })

  test('a match cannot span two textblocks of a list', () => {
    const document = parse('* one\n* two')
    expect(findInBlock(document, 0, 'onetwo').matches).toEqual([])
    expect(findInBlock(document, 0, 'one two').matches).toEqual([])
  })

  test('offsets after an inline image stay positions', () => {
    const image = schema.nodes.image.create({ src: 'x.png' })
    const document = doc(p('see ', image, ' the cat'))
    const { matches } = findInBlock(document, 0, 'cat')
    expect(matches.length).toBe(1)
    expect(document.textBetween(matches[0].from, matches[0].to)).toBe('cat')
  })

  test('an empty or non-string needle, or a bad block index, finds nothing', () => {
    const document = doc(p('abc'))
    expect(findInBlock(document, 0, '').matches).toEqual([])
    expect(findInBlock(document, 0, 5).matches).toEqual([])
    expect(findInBlock(document, 3, 'a').matches).toEqual([])
    expect(findInBlock(document, -1, 'a').matches).toEqual([])
    expect(findInBlock(document, 0.5, 'a').matches).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// planProposals: what is proposed
// ---------------------------------------------------------------------------

describe('planProposals, a valid edit', () => {
  test('in a paragraph', () => {
    const document = doc(p('one'), p('the cat sat'))
    const { plan, result } = planOne(document, { block: 1, find: 'cat', replace: 'dog', note: 'prefer dogs' })
    expect(result).toEqual({ index: 0, status: 'proposed', block: 1 })
    expect(plan.proposals.length).toBe(1)
    const prop = plan.proposals[0]
    expect(document.textBetween(prop.from, prop.to)).toBe('cat')
    expect(prop).toMatchObject({ block: 1, find: 'cat', replace: 'dog', note: 'prefer dogs' })
  })

  test('in a list item', () => {
    const document = parse('intro\n\n* one\n* two fish')
    const { plan, result } = planOne(document, { block: 1, find: 'fish', replace: 'cod' })
    expect(result.status).toBe('proposed')
    expect(document.textBetween(plan.proposals[0].from, plan.proposals[0].to)).toBe('fish')
  })

  test('in a table cell', () => {
    const document = parse('| A | B |\n| --- | --- |\n| red fish | blue |')
    const { plan, result } = planOne(document, { block: 0, find: 'blue', replace: 'green' })
    expect(result.status).toBe('proposed')
    expect(document.textBetween(plan.proposals[0].from, plan.proposals[0].to)).toBe('blue')
  })

  test('a heading, and the first block when the document has no special blocks', () => {
    const document = parse('# Title here\n\nbody')
    expect(planOne(document, { block: 0, find: 'Title', replace: 'Name' }).result.status).toBe('proposed')
  })

  test('the replacement may be empty (a deletion); note is optional', () => {
    const { plan, result } = planOne(doc(p('very good')), { block: 0, find: 'very ', replace: '' })
    expect(result.status).toBe('proposed')
    expect(plan.proposals[0].replace).toBe('')
    expect(plan.proposals[0].note).toBeUndefined()
  })

  test('results keep input order and index, with partial success', () => {
    const document = doc(p('alpha beta'), p('gamma delta'))
    const state = stateOf(document)
    const plan = planProposals(state, [
      { block: 0, expected: hashOf(document, 0), find: 'alpha', replace: 'A' },
      { block: 1, expected: hashOf(document, 1), find: 'missing', replace: 'x' },
      { block: 1, expected: hashOf(document, 1), find: 'delta', replace: 'D' },
    ], [])
    expect(plan.results.map(r => [r.index, r.status])).toEqual([[0, 'proposed'], [1, 'refused'], [2, 'proposed']])
    expect(plan.proposals.map(x => x.find)).toEqual(['alpha', 'delta'])
  })
})

describe('planProposals, refusals of the block', () => {
  const document = () => doc(p('one two'), p('three'))
  const reasonFor = (edit, doc2 = document()) => {
    const state = stateOf(doc2)
    const plan = planProposals(state, [edit], [])
    expect(plan.proposals).toEqual([])
    expect(plan.results[0].status).toBe('refused')
    return plan.results[0].reason
  }

  test('block that is not an integer, negative, or past the end', () => {
    const d = document()
    const base = { expected: 'x', find: 'one', replace: '1' }
    expect(reasonFor({ ...base, block: '0' })).toMatch(/block must be an integer/)
    expect(reasonFor({ ...base, block: 0.5 })).toMatch(/block must be an integer/)
    expect(reasonFor({ ...base, block: -1 })).toMatch(/block must be an integer/)
    expect(reasonFor({ ...base, block: 2 })).toMatch(/block must be an integer from 0 to 1/)
    expect(reasonFor({ ...base, block: undefined })).toMatch(/block must be an integer/)
    expect(d.childCount).toBe(2)
  })

  test('an edit that is not an object is refused, not thrown on', () => {
    const state = stateOf(document())
    const plan = planProposals(state, [null, 'text', 7, []], [])
    expect(plan.results.map(r => r.status)).toEqual(['refused', 'refused', 'refused', 'refused'])
    expect(plan.results.map(r => r.index)).toEqual([0, 1, 2, 3])
  })

  test('the metadata and HTML-preamble blocks cannot be edited', () => {
    const document = doc(codeBlock('metadata', 'title: x'), codeBlock('html', '<style></style>'), p('body text'))
    const state = stateOf(document)
    for (const block of [0, 1]) {
      const plan = planProposals(state, [{ block, expected: 'x', find: 'title', replace: 'T' }], [])
      expect(plan.results[0].status).toBe('refused')
      expect(plan.results[0].reason).toMatch(/metadata|preamble|firstEditable/)
    }
    expect(planOne(document, { block: 2, find: 'body', replace: 'text' }).result.status).toBe('proposed')
  })

  test('a code block is refused', () => {
    const document = doc(p('intro'), codeBlock('js', 'let cat = 1'))
    const state = stateOf(document)
    const plan = planProposals(state, [{ block: 1, expected: hashOf(document, 1), find: 'cat', replace: 'dog' }], [])
    expect(plan.results[0].status).toBe('refused')
    expect(plan.results[0].reason).toMatch(/code/)
  })
})

describe('planProposals, expected', () => {
  test('a hash that no longer matches refuses with "document changed"', () => {
    const document = doc(p('one'), p('two'))
    const state = stateOf(document)
    const plan = planProposals(state, [{ block: 1, expected: '0'.repeat(14), find: 'two', replace: '2' }], [])
    expect(plan.results[0].status).toBe('refused')
    expect(plan.results[0].reason).toMatch(/document changed/)
    expect(plan.proposals).toEqual([])
  })

  test('an expected that is not a string is refused and names expected', () => {
    const state = stateOf(doc(p('one')))
    for (const expected of [undefined, 5, null, ['h']]) {
      const plan = planProposals(state, [{ block: 0, expected, find: 'one', replace: '1' }], [])
      expect(plan.results[0].status).toBe('refused')
      expect(plan.results[0].reason).toMatch(/expected/)
    }
  })

  test('the hash is checked before the find is looked up', () => {
    const state = stateOf(doc(p('one')))
    const plan = planProposals(state, [{ block: 0, expected: 'nope', find: 'not in the text', replace: 'x' }], [])
    expect(plan.results[0].reason).toMatch(/document changed/)
  })
})

describe('planProposals, find', () => {
  test('empty or not a string', () => {
    for (const find of ['', undefined, null, 4]) {
      const { result } = planOne(doc(p('one')), { block: 0, find, replace: 'x' })
      expect(result.status).toBe('refused')
      expect(result.reason).toMatch(/find must be a non-empty string/)
    }
  })

  test('not found', () => {
    const { result } = planOne(doc(p('one')), { block: 0, find: 'two', replace: 'x' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/not found/)
  })

  test('ambiguous: the reason carries the count', () => {
    const { result } = planOne(doc(p('cat and cat and cat')), { block: 0, find: 'cat', replace: 'dog' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/3 times/)
  })

  test('case-sensitive: Cat does not match cat', () => {
    const { result } = planOne(doc(p('the cat')), { block: 0, find: 'Cat', replace: 'Dog' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/not found/)
  })

  test('a match that would span two textblocks of a list is not found', () => {
    const { result } = planOne(parse('* one\n* two'), { block: 0, find: 'onetwo', replace: 'x' })
    expect(result.reason).toMatch(/not found/)
  })

  test('a range containing an image is refused (the edit would delete it)', () => {
    const image = schema.nodes.image.create({ src: 'x.png' })
    const document = doc(p('see ', image, ' the cat'))
    const { result } = planOne(document, { block: 0, find: `see ￼ the`, replace: 'x' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/image|hard break/)
  })

  test('a range containing a hard break is refused', () => {
    const br = schema.nodes.hard_break.create()
    const document = doc(p('line one', br, 'line two'))
    const { result } = planOne(document, { block: 0, find: 'one￼line', replace: 'x' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/image|hard break/)
  })

  test('text on the far side of an image is still editable', () => {
    const image = schema.nodes.image.create({ src: 'x.png' })
    const document = doc(p('see ', image, ' the cat'))
    const { plan, result } = planOne(document, { block: 0, find: 'cat', replace: 'dog' })
    expect(result.status).toBe('proposed')
    expect(document.textBetween(plan.proposals[0].from, plan.proposals[0].to)).toBe('cat')
  })
})

describe('planProposals, replace and note', () => {
  test('replace that is not a string is refused', () => {
    for (const replace of [undefined, null, 3, ['x']]) {
      const { result } = planOne(doc(p('one')), { block: 0, find: 'one', replace })
      expect(result.status).toBe('refused')
      expect(result.reason).toMatch(/replace must be a string/)
    }
  })

  test('replace equal to find is a no-op and is refused', () => {
    const { result } = planOne(doc(p('one')), { block: 0, find: 'one', replace: 'one' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/no-op|same/)
  })

  test('note must be a string when present', () => {
    for (const note of [3, null, {}, ['n']]) {
      const { result } = planOne(doc(p('one')), { block: 0, find: 'one', replace: '1', note })
      expect(result.status).toBe('refused')
      expect(result.reason).toMatch(/note must be a string/)
    }
    expect(planOne(doc(p('one')), { block: 0, find: 'one', replace: '1', note: 'why' }).result.status).toBe('proposed')
  })
})

describe('planProposals, overlap', () => {
  const pendingAt = (from, to) => [{ id: 's1', from, to, find: 'x', replace: 'y', block: 0 }]

  test('overlap with a pending suggestion is refused', () => {
    const document = doc(p('the quick fox'))
    const first = planOne(document, { block: 0, find: 'quick', replace: 'slow' }).plan.proposals[0]
    const { result } = planOne(document, { block: 0, find: 'quick fox', replace: 'x' }, pendingAt(first.from, first.to))
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/overlap/)
  })

  test('overlap with an earlier edit of the same batch is refused, and the earlier one stands', () => {
    const document = doc(p('the quick fox'))
    const state = stateOf(document)
    const hash = hashOf(document, 0)
    const plan = planProposals(state, [
      { block: 0, expected: hash, find: 'the quick', replace: 'a slow' },
      { block: 0, expected: hash, find: 'quick fox', replace: 'x' },
      { block: 0, expected: hash, find: 'fox', replace: 'dog' },
    ], [])
    expect(plan.results.map(r => r.status)).toEqual(['proposed', 'refused', 'proposed'])
    expect(plan.results[1].reason).toMatch(/overlap/)
    expect(plan.proposals.map(x => x.find)).toEqual(['the quick', 'fox'])
  })

  test('a refused edit does not block a later one it would have overlapped', () => {
    const document = doc(p('the quick fox'))
    const state = stateOf(document)
    const hash = hashOf(document, 0)
    const plan = planProposals(state, [
      { block: 0, expected: hash, find: 'nothing', replace: 'x' },
      { block: 0, expected: hash, find: 'quick', replace: 'slow' },
    ], [])
    expect(plan.results.map(r => r.status)).toEqual(['refused', 'proposed'])
  })

  test('adjacent ranges (touching ends) are allowed', () => {
    const document = doc(p('abcdef'))
    const state = stateOf(document)
    const hash = hashOf(document, 0)
    const plan = planProposals(state, [
      { block: 0, expected: hash, find: 'abc', replace: 'X' },
      { block: 0, expected: hash, find: 'def', replace: 'Y' },
    ], [])
    expect(plan.results.map(r => r.status)).toEqual(['proposed', 'proposed'])
    expect(plan.proposals[0].to).toBe(plan.proposals[1].from)
  })
})

describe('planProposals, marks', () => {
  test('carries the marks of the first character of the range', () => {
    const document = doc(p('plain ', bold('bold'), ' plain'))
    const { plan } = planOne(document, { block: 0, find: 'bold', replace: 'strong' })
    expect(plan.proposals[0].marks.map(m => m.type.name)).toEqual(['strong'])
  })

  test('a range that starts plain has no marks, whatever follows', () => {
    const document = doc(p('plain ', bold('bold')))
    const { plan } = planOne(document, { block: 0, find: 'plain bold', replace: 'x' })
    expect(plan.proposals[0].marks).toEqual([])
  })
})

describe('planProposals never throws', () => {
  test('on odd input as the edits list or the pending list', () => {
    const state = stateOf(doc(p('one')))
    expect(() => planProposals(state, undefined, undefined)).not.toThrow()
    expect(planProposals(state, 'nope', []).results).toEqual([])
    const odd = planProposals(state, [{}], null)
    expect(odd.results[0].status).toBe('refused')
  })
})

// ---------------------------------------------------------------------------
// plugin state: mapping, stale handling, resolved records
// ---------------------------------------------------------------------------

const withPlugin = (document) => EditorState.create({ doc: document, plugins: [history(), suggestionsPlugin()] })

/** Propose edits (hash filled in) on a state that has the plugin, as the MU wrapper will. */
function propose(state, ...edits) {
  const full = edits.map(e => ({ expected: hashOf(state.doc, e.block), ...e }))
  const plan = planProposals(state, full, getSuggestions(state).pending)
  const refused = plan.results.filter(r => r.status === 'refused')
  expect(refused, JSON.stringify(refused)).toEqual([])
  return state.apply(state.tr.setMeta(suggestionsKey, { add: plan.proposals }))
}

// 'the cat sat' is one paragraph starting at position 0, so its text starts at 1: cat is 5..8.
const catState = () => propose(withPlugin(doc(p('the cat sat'))), { block: 0, find: 'cat', replace: 'dog' })
const onlyPending = (state) => getSuggestions(state).pending[0]
const textOf = (state, s) => state.doc.textBetween(s.from, s.to)

describe('suggestionsPlugin, adding and reading', () => {
  test('a proposal becomes pending with an id, and getSuggestions returns {pending, resolved}', () => {
    const state = catState()
    const { pending, resolved } = getSuggestions(state)
    expect(resolved).toEqual([])
    expect(pending.length).toBe(1)
    expect(pending[0]).toMatchObject({ id: 's1', find: 'cat', replace: 'dog', block: 0 })
    expect(textOf(state, pending[0])).toBe('cat')
  })

  test('ids are monotonic across add batches, and not reused after a resolution', () => {
    let state = withPlugin(doc(p('one two three four')))
    state = propose(state, { block: 0, find: 'one', replace: '1' }, { block: 0, find: 'two', replace: '2' })
    state = state.apply(state.tr.setMeta(suggestionsKey, { rejected: ['s2'] }))
    state = propose(state, { block: 0, find: 'three', replace: '3' })
    expect(getSuggestions(state).pending.map(s => s.id)).toEqual(['s1', 's3'])
  })

  test('getSuggestions on a state without the plugin is empty', () => {
    expect(getSuggestions(stateOf(doc(p('x'))))).toEqual({ pending: [], resolved: [] })
  })

  test('a transaction carrying only suggestions meta does not change the doc', () => {
    const state = catState()
    const after = state.apply(state.tr.setMeta(suggestionsKey, { rejected: ['s1'] }))
    expect(after.doc.eq(state.doc)).toBe(true)
    const tr = state.tr.setMeta(suggestionsKey, { add: [] })
    expect(tr.docChanged).toBe(false)
  })

  test('accepted and rejected ids move to resolved with that status; unknown ids are ignored', () => {
    let state = withPlugin(doc(p('one two')))
    state = propose(state, { block: 0, find: 'one', replace: '1', note: 'n1' }, { block: 0, find: 'two', replace: '2' })
    state = state.apply(state.tr.setMeta(suggestionsKey, { accepted: ['s1', 's99'], rejected: ['s2'] }))
    const { pending, resolved } = getSuggestions(state)
    expect(pending).toEqual([])
    expect(resolved).toEqual([
      { id: 's1', status: 'accepted', find: 'one', replace: '1', note: 'n1', block: 0 },
      { id: 's2', status: 'rejected', find: 'two', replace: '2', block: 0 },
    ])
  })
})

describe('suggestionsPlugin, mapping through edits (assoc pinned at the boundaries)', () => {
  test('an insert before the range shifts it', () => {
    const state = catState()
    const after = state.apply(state.tr.insertText('XX', 1))
    const s = onlyPending(after)
    expect([s.from, s.to]).toEqual([7, 10])
    expect(textOf(after, s)).toBe('cat')
  })

  test('an insert after the range leaves it', () => {
    const state = catState()
    const after = state.apply(state.tr.insertText('XX', 10))
    const s = onlyPending(after)
    expect([s.from, s.to]).toEqual([5, 8])
  })

  test('an insert exactly at from stays outside the range', () => {
    const state = catState()
    const after = state.apply(state.tr.insertText('XX', 5))
    const s = onlyPending(after)
    expect(s).toBeDefined()
    expect(textOf(after, s)).toBe('cat')
    expect([s.from, s.to]).toEqual([7, 10])
  })

  test('an insert exactly at to stays outside the range', () => {
    const state = catState()
    const after = state.apply(state.tr.insertText('XX', 8))
    const s = onlyPending(after)
    expect(s).toBeDefined()
    expect(textOf(after, s)).toBe('cat')
    expect([s.from, s.to]).toEqual([5, 8])
  })

  test('two suggestions in one paragraph both stay right after an edit between them', () => {
    let state = withPlugin(doc(p('alpha beta gamma delta')))
    state = propose(state, { block: 0, find: 'alpha', replace: 'A' }, { block: 0, find: 'delta', replace: 'D' })
    state = state.apply(state.tr.insertText('INSERTED ', 8))   // between 'alpha ' and 'beta'
    const pending = getSuggestions(state).pending
    expect(pending.map(s => textOf(state, s))).toEqual(['alpha', 'delta'])
    expect(pending.map(s => s.id)).toEqual(['s1', 's2'])
  })

  test('undoing the user\'s typing elsewhere keeps ranges correct', () => {
    let state = catState()
    state = state.apply(state.tr.insertText('XX', 1))
    expect(textOf(state, onlyPending(state))).toBe('cat')
    let undone
    expect(undo(state, (tr) => { undone = state.apply(tr) })).toBe(true)
    const s = onlyPending(undone)
    expect([s.from, s.to]).toEqual([5, 8])
    expect(textOf(undone, s)).toBe('cat')
    let redone
    expect(redo(undone, (tr) => { redone = undone.apply(tr) })).toBe(true)
    expect(textOf(redone, onlyPending(redone))).toBe('cat')
  })

  test('the block index follows the range when a block is inserted before it', () => {
    let state = propose(withPlugin(doc(p('one'), p('the cat'))), { block: 1, find: 'cat', replace: 'dog' })
    state = state.apply(state.tr.insert(0, p('new first')))
    expect(onlyPending(state).block).toBe(2)
  })
})

describe('suggestionsPlugin, a user edit inside the range makes it stale', () => {
  const staleWith = (change) => {
    const state = catState()
    return state.apply(change(state.tr))
  }
  const expectEdited = (after) => {
    const { pending, resolved } = getSuggestions(after)
    expect(pending).toEqual([])
    expect(resolved).toEqual([{ id: 's1', status: 'stale', reason: 'edited', find: 'cat', replace: 'dog', block: 0 }])
  }

  test('typing inside it', () => expectEdited(staleWith(tr => tr.insertText('Z', 6))))
  test('deleting part of it', () => expectEdited(staleWith(tr => tr.delete(5, 6))))
  test('deleting across its start', () => expectEdited(staleWith(tr => tr.delete(3, 6))))
  test('deleting across its end', () => expectEdited(staleWith(tr => tr.delete(7, 10))))
  test('deleting all of it', () => expectEdited(staleWith(tr => tr.delete(5, 8))))
  test('replacing it with other text', () => expectEdited(staleWith(tr => tr.insertText('hen', 5, 8))))

  test('replacing it with the very same text changes nothing, so it stays pending', () => {
    const state = catState()
    const after = state.apply(state.tr.insertText('cat', 5, 8))
    expect(getSuggestions(after).pending.length).toBe(1)
  })

  test('a mark change over the text is not an edit', () => {
    const state = catState()
    const after = state.apply(state.tr.addMark(5, 8, schema.marks.strong.create()))
    expect(getSuggestions(after).pending.length).toBe(1)
  })
})

describe('suggestionsPlugin, replacing the whole document', () => {
  /** What markupeditor-base's setHTML dispatches: AllSelection, replaceSelectionWith, no history. */
  const setHTMLShape = (state, node) => state.tr
    .setSelection(new AllSelection(state.doc))
    .replaceSelectionWith(node, false)
    .setMeta('addToHistory', false)

  test('marks every pending suggestion stale with reason document-replaced, and keeps the records', () => {
    let state = withPlugin(doc(p('one two'), p('three')))
    state = propose(state, { block: 0, find: 'one', replace: '1' }, { block: 1, find: 'three', replace: '3' })
    const after = state.apply(setHTMLShape(state, doc(p('one two'), p('three'))))
    const { pending, resolved } = getSuggestions(after)
    expect(pending).toEqual([])
    expect(resolved.map(r => [r.id, r.status, r.reason])).toEqual([
      ['s1', 'stale', 'document-replaced'], ['s2', 'stale', 'document-replaced']])
  })

  test('even when the new document has the very same text', () => {
    const document = doc(p('the cat sat'))
    const state = propose(withPlugin(document), { block: 0, find: 'cat', replace: 'dog' })
    const after = state.apply(setHTMLShape(state, document.copy(document.content)))
    expect(getSuggestions(after).resolved[0].reason).toBe('document-replaced')
  })

  test('a user who selects everything and types is an edit, not a replaced document', () => {
    const state = catState()
    const tr = state.tr.setSelection(new AllSelection(state.doc)).replaceSelectionWith(schema.text('new'), true)
    const after = state.apply(tr)
    expect(getSuggestions(after).resolved[0].reason).toBe('edited')
  })

  test('a suggestions-only transaction is never read as a replacement', () => {
    const state = catState()
    const after = state.apply(state.tr.setMeta('addToHistory', false).setMeta(suggestionsKey, { add: [] }))
    expect(getSuggestions(after).pending.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// accept, reject, navigate
// ---------------------------------------------------------------------------

/** A stand-in for an EditorView: state, dispatch (recorded), and the DOM events dispatched on it. */
function fakeView(state) {
  const view = {
    state,
    transactions: [],
    events: [],
    dom: { dispatchEvent(event) { view.events.push(event.type) } },
    dispatch(tr) { view.transactions.push(tr); view.state = view.state.apply(tr) },
    updateState(next) { view.state = next },
  }
  return view
}

const threeInOne = () => propose(withPlugin(doc(p('alpha beta gamma delta'))),
  { block: 0, find: 'alpha', replace: 'A' }, { block: 0, find: 'gamma', replace: 'GG' }, { block: 0, find: 'delta', replace: '' })
const undoOnce = (state) => { let next; expect(undo(state, (tr) => { next = state.apply(tr) })).toBe(true); return next }
const redoOnce = (state) => { let next; expect(redo(state, (tr) => { next = state.apply(tr) })).toBe(true); return next }

describe('acceptSuggestions', () => {
  test('puts the replacement in the document and records the suggestion as accepted', () => {
    const view = fakeView(catState())
    const result = acceptSuggestions(view, ['s1'])
    expect(result).toEqual({ accepted: ['s1'], skipped: [] })
    expect(view.state.doc.textContent).toBe('the dog sat')
    expect(getSuggestions(view.state).pending).toEqual([])
    expect(getSuggestions(view.state).resolved).toEqual([{ id: 's1', status: 'accepted', find: 'cat', replace: 'dog', block: 0 }])
  })

  test('the replacement inherits the marks of the first character of the range', () => {
    const view = fakeView(propose(withPlugin(doc(p('plain ', bold('bold'), ' plain'))), { block: 0, find: 'bold', replace: 'strong' }))
    acceptSuggestions(view, ['s1'])
    const marked = []
    view.state.doc.descendants((node) => { if (node.isText && node.marks.length) marked.push([node.text, node.marks.map(m => m.type.name)]) })
    expect(marked).toEqual([['strong', ['strong']]])
  })

  test('an empty replacement deletes the text', () => {
    const view = fakeView(propose(withPlugin(doc(p('very good'))), { block: 0, find: 'very ', replace: '' }))
    acceptSuggestions(view, ['s1'])
    expect(view.state.doc.textContent).toBe('good')
  })

  test('a later pending suggestion in the same paragraph is still correct after an accept', () => {
    const view = fakeView(propose(withPlugin(doc(p('alpha beta gamma'))),
      { block: 0, find: 'alpha', replace: 'a much longer replacement' }, { block: 0, find: 'gamma', replace: 'g' }))
    acceptSuggestions(view, ['s1'])
    const rest = getSuggestions(view.state).pending
    expect(rest.map(s => s.id)).toEqual(['s2'])
    expect(textOf(view.state, rest[0])).toBe('gamma')
  })

  test('the caret ends after the last replacement', () => {
    const view = fakeView(catState())
    acceptSuggestions(view, ['s1'])
    expect(view.state.selection.empty).toBe(true)
    expect(view.state.selection.from).toBe(8)
  })

  test('is one transaction, tells the host the document changed once, and one undo restores the original exactly', () => {
    const original = catState()
    const view = fakeView(original)
    acceptSuggestions(view, ['s1'])
    expect(view.transactions.filter(tr => tr.docChanged).length).toBe(1)
    expect(view.events).toEqual(['input'])
    const changed = view.state
    const undone = undoOnce(changed)
    expect(undone.doc.eq(original.doc)).toBe(true)
    expect(redoOnce(undone).doc.eq(changed.doc)).toBe(true)
  })

  test('the change carries closeHistory$, and a second transaction closes the event after it', () => {
    const view = fakeView(catState())
    acceptSuggestions(view, ['s1'])
    expect(view.transactions.length).toBe(2)
    expect(view.transactions[0].docChanged).toBe(true)
    expect(view.transactions[0].getMeta('closeHistory$')).toBe(true)
    expect(view.transactions[1].docChanged).toBe(false)
    expect(view.transactions[1].getMeta('closeHistory$')).toBe(true)
  })

  // History joins two changes into one undo event when they come close in time and touch, so these type right
  // beside the range: at its end before the accept, and at the end of the replacement after it.
  test('the accept is its own undo event even straight after typing beside the range', () => {
    let state = catState()
    state = state.apply(state.tr.insertText('X', 8))
    const typed = state.doc
    expect(typed.textContent).toBe('the catX sat')
    const view = fakeView(state)
    acceptSuggestions(view, ['s1'])
    expect(view.state.doc.textContent).toBe('the dogX sat')
    expect(undoOnce(view.state).doc.eq(typed)).toBe(true)
  })

  test('typing right after an accept is its own undo event', () => {
    const view = fakeView(catState())
    acceptSuggestions(view, ['s1'])
    const accepted = view.state.doc
    view.dispatch(view.state.tr.insertText('Y', 8))
    expect(view.state.doc.textContent).toBe('the dogY sat')
    expect(undoOnce(view.state).doc.eq(accepted)).toBe(true)
  })

  test('undoing an accept restores the text but leaves the record accepted', () => {
    const view = fakeView(catState())
    acceptSuggestions(view, ['s1'])
    const undone = undoOnce(view.state)
    expect(undone.doc.textContent).toBe('the cat sat')
    const { pending, resolved } = getSuggestions(undone)
    expect(pending).toEqual([])
    expect(resolved.map(r => [r.id, r.status])).toEqual([['s1', 'accepted']])
  })

  test('a stale or unknown id leaves the document alone and says so', () => {
    let state = catState()
    state = state.apply(state.tr.insertText('Z', 6))              // typing inside makes s1 stale
    const view = fakeView(state)
    const before = view.state.doc
    const result = acceptSuggestions(view, ['s1', 's42'])
    expect(result.accepted).toEqual([])
    expect(result.skipped.map(x => x.id)).toEqual(['s1', 's42'])
    expect(result.skipped[0].reason).toMatch(/stale/)
    expect(result.skipped[1].reason).toMatch(/unknown/)
    expect(view.state.doc.eq(before)).toBe(true)
    expect(view.transactions).toEqual([])
    expect(view.events).toEqual([])
  })

  test('accepting some and skipping others applies the ones that can be', () => {
    const view = fakeView(threeInOne())
    const result = acceptSuggestions(view, ['s2', 's99'])
    expect(result.accepted).toEqual(['s2'])
    expect(result.skipped.map(x => x.id)).toEqual(['s99'])
    expect(view.state.doc.textContent).toBe('alpha beta GG delta')
  })

  test('accepting all three in one paragraph is one transaction and one undo step', () => {
    const original = threeInOne()
    const view = fakeView(original)
    const result = acceptSuggestions(view, ['s1', 's2', 's3'])
    expect(result.accepted).toEqual(['s1', 's2', 's3'])
    expect(view.state.doc.textContent).toBe('A beta GG ')
    expect(view.transactions.filter(tr => tr.docChanged).length).toBe(1)
    expect(view.events).toEqual(['input'])
    expect(getSuggestions(view.state).resolved.map(r => r.status)).toEqual(['accepted', 'accepted', 'accepted'])
    expect(undoDepth(view.state)).toBe(1)
    expect(undoOnce(view.state).doc.eq(original.doc)).toBe(true)
  })

  test('the ids given in any order, or twice, give the same result', () => {
    const view = fakeView(threeInOne())
    acceptSuggestions(view, ['s3', 's1', 's1'])
    expect(view.state.doc.textContent).toBe('A beta gamma ')
  })

  test('no ids, or ids that are not an array, change nothing', () => {
    const view = fakeView(threeInOne())
    expect(acceptSuggestions(view, [])).toEqual({ accepted: [], skipped: [] })
    expect(acceptSuggestions(view, undefined).accepted).toEqual([])
    expect(view.transactions).toEqual([])
  })
})

describe('rejectSuggestions', () => {
  test('records the suggestion as rejected and changes neither the document nor the undo history', () => {
    const view = fakeView(catState())
    const before = view.state.doc
    const depth = undoDepth(view.state)
    const result = rejectSuggestions(view, ['s1'])
    expect(result).toEqual({ rejected: ['s1'], skipped: [] })
    expect(view.state.doc.eq(before)).toBe(true)
    expect(undoDepth(view.state)).toBe(depth)
    expect(view.events).toEqual([])                                // rejecting does not dirty the document
    expect(getSuggestions(view.state).resolved.map(r => [r.id, r.status])).toEqual([['s1', 'rejected']])
    expect(view.transactions.length).toBe(1)
    expect(view.transactions[0].getMeta('addToHistory')).toBe(false)
  })

  test('reject of several, a stale one, and an unknown one', () => {
    let state = threeInOne()
    state = state.apply(state.tr.insertText('Z', 3))               // inside alpha: s1 goes stale
    const view = fakeView(state)
    const result = rejectSuggestions(view, ['s1', 's2', 's77'])
    expect(result.rejected).toEqual(['s2'])
    expect(result.skipped.map(x => x.id)).toEqual(['s1', 's77'])
    expect(getSuggestions(view.state).pending.map(s => s.id)).toEqual(['s3'])
  })
})

describe('next and previous', () => {
  // 'a1 b2 c3' : three suggestions in one paragraph, text starting at position 1
  const three = () => propose(withPlugin(doc(p('a1 b2 c3'))),
    { block: 0, find: 'a1', replace: 'A' }, { block: 0, find: 'b2', replace: 'B' }, { block: 0, find: 'c3', replace: 'C' })

  test('nextSuggestionTarget is the first suggestion after the caret, wrapping, and null when there is none', () => {
    const state = three()
    expect(state.selection.from).toBe(1)
    expect(nextSuggestionTarget(state, 'next').id).toBe('s2')       // s1 starts at the caret, not after it
    const atEnd = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9)))
    expect(nextSuggestionTarget(atEnd, 'next').id).toBe('s1')       // wraps
    expect(nextSuggestionTarget(withPlugin(doc(p('x'))), 'next')).toBeNull()
  })

  test('previousSuggestionTarget is the last suggestion before the caret, wrapping', () => {
    const state = three()
    expect(nextSuggestionTarget(state, 'previous').id).toBe('s3')   // nothing before the start: wraps
    const mid = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)))
    expect(nextSuggestionTarget(mid, 'previous').id).toBe('s2')
  })

  test('goToSuggestion selects the range, and next then previous round-trips', () => {
    const view = fakeView(three())
    const first = goToSuggestion(view, 'next')
    expect(first).toEqual({ found: true, id: 's2', block: 0 })
    expect([view.state.selection.from, view.state.selection.to]).toEqual([4, 6])
    expect(goToSuggestion(view, 'next').id).toBe('s3')
    expect(goToSuggestion(view, 'next').id).toBe('s1')              // wraps
    expect(goToSuggestion(view, 'next').id).toBe('s2')
    expect(goToSuggestion(view, 'previous').id).toBe('s1')
    expect(goToSuggestion(view, 'previous').id).toBe('s3')          // wraps backwards
    expect(view.events).toEqual([])
  })

  test('goToSuggestion with nothing pending finds nothing and dispatches nothing', () => {
    const view = fakeView(withPlugin(doc(p('x'))))
    expect(goToSuggestion(view, 'next')).toEqual({ found: false })
    expect(view.transactions).toEqual([])
  })

  test('resolved suggestions are skipped', () => {
    const view = fakeView(three())
    rejectSuggestions(view, ['s2'])
    expect(goToSuggestion(view, 'next').id).toBe('s3')
  })
})
