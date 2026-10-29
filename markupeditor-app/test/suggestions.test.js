import { describe, test, expect } from 'vitest'
import { MU, EditorState } from 'markupeditor'
import { history } from 'prosemirror-history'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { describeBlocks } from '../src/doc-blocks.js'
import { findInBlock, planProposals } from '../src/suggestions.js'

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
