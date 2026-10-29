import { describe, test, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { MU, EditorState, EditorView, AllSelection, TextSelection, DOMSerializer } from 'markupeditor'
import { history, undo, redo, undoDepth } from 'prosemirror-history'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { makeSerializer } from '../src/serializer.js'
import { planReplace } from '../src/replace-blocks.js'
import { describeBlocks } from '../src/doc-blocks.js'
import {
  findInBlock, planProposals, suggestionsKey, suggestionsPlugin, getSuggestions,
  acceptSuggestions, rejectSuggestions, nextSuggestionTarget, goToSuggestion, buildWidget,
  ensureInstalled, proposeEdits, listSuggestions, nextSuggestion, previousSuggestion, acceptAllSuggestions, rejectAllSuggestions,
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

  test('skips code blocks, also when nested in a quote or a list item', () => {
    const quote = schema.nodes.blockquote.create(null, [p('a cat'), codeBlock('js', 'let cat = 1')])
    const listItem = schema.nodes.list_item.create(null, [p('a cat'), codeBlock('js', 'let cat = 1')])
    const list = schema.nodes.bullet_list.create(null, [listItem])
    for (const block of [quote, list]) {
      const document = doc(block)
      const { matches } = findInBlock(document, 0, 'cat')
      expect(matches.length).toBe(1)
      expect(document.resolve(matches[0].from).parent.type.name).toBe('paragraph')
      expect(findInBlock(document, 0, 'let cat').matches).toEqual([])
    }
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

  test('not found says find matches the visible text, without Markdown syntax', () => {
    const { result } = planOne(doc(p('the ', bold('bold cat'))), { block: 0, find: '**bold cat**', replace: 'x' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/not found/)
    expect(result.reason).toMatch(/visible text/)
    expect(result.reason).toMatch(/without Markdown/)
    expect(result.reason).toMatch(/\*\* _ ` ~~ \[ \]\( \)/)
    expect(result.reason).toMatch(/backslash escapes/)
  })

  test('a code block nested in a quote or a list item is refused when it holds the only match', () => {
    const quote = schema.nodes.blockquote.create(null, [p('intro'), codeBlock('js', 'let cat = 1')])
    const item = schema.nodes.list_item.create(null, [p('intro'), codeBlock('js', 'let cat = 1')])
    for (const block of [quote, schema.nodes.bullet_list.create(null, [item])]) {
      const { plan, result } = planOne(doc(block), { block: 0, find: 'cat', replace: 'dog' })
      expect(result.status).toBe('refused')
      expect(result.reason).toMatch(/code block/)
      expect(result.reason).toMatch(/prose/)
      expect(plan.proposals).toEqual([])
    }
  })

  test('a match in prose is proposed even when the same text also sits in a nested code block', () => {
    const quote = schema.nodes.blockquote.create(null, [p('a cat'), codeBlock('js', 'let cat = 1')])
    const document = doc(quote)
    const { plan, result } = planOne(document, { block: 0, find: 'cat', replace: 'dog' })
    expect(result.status).toBe('proposed')
    expect(document.resolve(plan.proposals[0].from).parent.type.name).toBe('paragraph')
  })

  test('not found names the syntax to leave out, and says inline code matches without its backticks', () => {
    const { result } = planOne(doc(p('the cat')), { block: 0, find: '`dog`', replace: 'x' })
    expect(result.reason).toMatch(/\*\* _ ` ~~ \[ \]\( \) !\[\]\( \) # list markers/)
    expect(result.reason).toMatch(/inline code matches without its backticks/)
  })

  test('a find that crosses a formatting boundary is refused, with the remedy', () => {
    const document = parse('Basically the `queue` drains in order.')
    const { plan, result } = planOne(document, { block: 0, find: 'Basically the queue drains', replace: 'The queue drains' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/crosses a formatting boundary \(bold, code, link/)
    expect(result.reason).toMatch(/split the edit so each part lies inside one run of formatting/)
    expect(plan.proposals).toEqual([])
  })

  test('every kind of boundary refuses: bold, emphasis, strike, link', () => {
    for (const md of ['plain **bold** plain', 'plain _em_ plain', 'plain ~~gone~~ plain', 'plain [site](https://x.org) plain']) {
      const document = parse(md)
      const visible = document.textContent
      const { result } = planOne(document, { block: 0, find: visible.slice(2, visible.length - 2), replace: 'x' })
      expect(result.status, md).toBe('refused')
      expect(result.reason, md).toMatch(/formatting boundary/)
    }
  })

  test('two runs with different marks refuse even when both are formatted (bold then code)', () => {
    const code = (text) => schema.text(text, [schema.marks.code.create()])
    const { result } = planOne(doc(p('a ', bold('bold'), code('code'), ' z')), { block: 0, find: 'boldcode', replace: 'x' })
    expect(result.status).toBe('refused')
    expect(result.reason).toMatch(/formatting boundary/)
  })

  test('a range wholly inside one run of formatting is proposed: plain text before inline code, inline code itself, bold, a link', () => {
    const document = parse('Basically the `queue` drains in **very good** order via [the site](https://x.org).')
    for (const find of ['Basically the ', 'queue', 'very good', 'ver', 'the site']) {
      const { result } = planOne(document, { block: 0, find, replace: 'x' })
      expect(result.status, find).toBe('proposed')
    }
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

  test('replace or note with a line break or another control character is refused, with a reason that says so', () => {
    for (const bad of ['dog\n\n# Heading', 'dog\ndog', 'dog\rx', 'a\u0000b', 'a\tb', 'a\u001fb', 'a\u007fb', 'a\u0085b', 'a\u2028b', 'a\u2029b']) {
      const inReplace = planOne(doc(p('one')), { block: 0, find: 'one', replace: bad })
      expect(inReplace.result.status, JSON.stringify(bad)).toBe('refused')
      expect(inReplace.result.reason).toMatch(/replace must not contain line breaks or other control characters/)
      expect(inReplace.plan.proposals).toEqual([])
      const inNote = planOne(doc(p('one')), { block: 0, find: 'one', replace: '1', note: bad })
      expect(inNote.result.status, JSON.stringify(bad)).toBe('refused')
      expect(inNote.result.reason).toMatch(/note must not contain line breaks or other control characters/)
    }
  })

  test('U+009F, the last C1 control character, is refused in replace and in note', () => {
    const inReplace = planOne(doc(p('one')), { block: 0, find: 'one', replace: 'a\u009fb' })
    expect(inReplace.result.status).toBe('refused')
    expect(inReplace.result.reason).toMatch(/replace must not contain line breaks or other control characters/)
    const inNote = planOne(doc(p('one')), { block: 0, find: 'one', replace: '1', note: 'a\u009fb' })
    expect(inNote.result.status).toBe('refused')
    expect(inNote.result.reason).toMatch(/note must not contain line breaks or other control characters/)
  })

  test('ordinary punctuation, accents, emoji and spaces are not control characters', () => {
    const { result } = planOne(doc(p('one')), { block: 0, find: 'one', replace: 'café 😀 "q" \u00a0x', note: 'ok: yes, é' })
    expect(result.status).toBe('proposed')
  })

  test('replace or note longer than 2000 characters is refused; exactly 2000 is allowed', () => {
    const long = 'x'.repeat(2001)
    const inReplace = planOne(doc(p('one')), { block: 0, find: 'one', replace: long })
    expect(inReplace.result.status).toBe('refused')
    expect(inReplace.result.reason).toMatch(/replace must be at most 2000 characters/)
    const inNote = planOne(doc(p('one')), { block: 0, find: 'one', replace: '1', note: long })
    expect(inNote.result.status).toBe('refused')
    expect(inNote.result.reason).toMatch(/note must be at most 2000 characters/)
    expect(planOne(doc(p('one')), { block: 0, find: 'one', replace: 'x'.repeat(2000), note: 'y'.repeat(2000) }).result.status).toBe('proposed')
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

describe('planProposals, no marks are planned', () => {
  test('a proposal carries no marks: they are read from the document when the suggestion is accepted', () => {
    const document = doc(p('plain ', bold('bold'), ' plain'))
    const { plan } = planOne(document, { block: 0, find: 'bold', replace: 'strong' })
    expect(Object.keys(plan.proposals[0]).sort()).toEqual(['block', 'find', 'from', 'note', 'replace', 'to'])
    const state = propose(withPlugin(document), { block: 0, find: 'bold', replace: 'strong' })
    expect('marks' in onlyPending(state)).toBe(false)
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

  test('splitting a paragraph inside it (Enter)', () => expectEdited(staleWith(tr => tr.split(6))))
  test('splitting a paragraph inside it with a split that also carries addToHistory', () => expectEdited(staleWith(tr => tr.split(7).setMeta('addToHistory', true))))

  test('a non-spanning edit that stays out of history is still an edit, not a replaced document', () => {
    const state = catState()
    const after = state.apply(state.tr.insertText('Z', 6).setMeta('addToHistory', false))
    expect(getSuggestions(after).resolved.map(r => r.reason)).toEqual(['edited'])
    const typedElsewhere = state.apply(state.tr.insertText('Z', 1).setMeta('addToHistory', false))
    expect(getSuggestions(typedElsewhere).pending.length).toBe(1)
  })

  test('a non-spanning edit that starts at position 0 and stays out of history is still an edit', () => {
    // The step's range begins at the document start but ends well before its end, so it is not a replaced document.
    const state = catState()
    const tr = state.tr.delete(0, 8).setMeta('addToHistory', false)
    expect(tr.docChanged).toBe(true)
    expect(tr.mapping.maps[0].ranges[0]).toBe(0)
    expect(tr.mapping.maps[0].ranges[0] + tr.mapping.maps[0].ranges[1]).toBeLessThan(state.doc.content.size)
    expectEdited(state.apply(tr))
  })

  test('a resolved record takes its block from the document before the transaction', () => {
    const state = propose(withPlugin(doc(p('one'), p('the cat'))), { block: 1, find: 'cat', replace: 'dog' })
    expect(onlyPending(state).block).toBe(1)
    const tr = state.tr.insert(0, p('new first'))
    tr.delete(tr.mapping.map(onlyPending(state).from, 1), tr.mapping.map(onlyPending(state).to, -1))
    const after = state.apply(tr)
    expect(getSuggestions(after).resolved).toEqual([
      { id: 's1', status: 'stale', reason: 'edited', find: 'cat', replace: 'dog', block: 1 }])
  })

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
  /** A real EditorView over a state with the plugin; `proposeOn` proposes through the plugin as the MU wrapper does. */
  const proposeOn = (view, ...edits) => {
    const full = edits.map(e => ({ expected: hashOf(view.state.doc, e.block), ...e }))
    const plan = planProposals(view.state, full, getSuggestions(view.state).pending)
    expect(plan.results.map(r => r.status)).toEqual(full.map(() => 'proposed'))
    view.dispatch(view.state.tr.setMeta('addToHistory', false).setMeta(suggestionsKey, { add: plan.proposals }))
  }

  test('the real MU.setHTML makes every pending suggestion stale, document-replaced, and keeps the records', () => {
    const host = document.createElement('div')
    const view = new EditorView(host, { state: withPlugin(doc(p('one two'), p('three'))) })
    try {
      proposeOn(view, { block: 0, find: 'one', replace: '1' }, { block: 1, find: 'three', replace: '3' })
      MU.setHTML('<p>Brand new.</p>', false, undefined, view)
      expect(view.state.doc.textContent).toBe('Brand new.')
      const { pending, resolved } = getSuggestions(view.state)
      expect(pending).toEqual([])
      expect(resolved.map(r => [r.id, r.status, r.reason])).toEqual([
        ['s1', 'stale', 'document-replaced'], ['s2', 'stale', 'document-replaced']])
    } finally {
      view.destroy()
    }
  })

  test('the real MU.setHTML with the very same content is still a replaced document', () => {
    const host = document.createElement('div')
    const view = new EditorView(host, { state: withPlugin(doc(p('Brand new.'))) })
    try {
      proposeOn(view, { block: 0, find: 'Brand', replace: 'Old' })
      MU.setHTML('<p>Brand new.</p>', false, undefined, view)
      expect(getSuggestions(view.state).resolved.map(r => [r.id, r.reason])).toEqual([['s1', 'document-replaced']])
    } finally {
      view.destroy()
    }
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

  test('accepting an edit beside inline code leaves the code as code', () => {
    const view = fakeView(propose(withPlugin(parse('Basically the `queue` drains in order.')), { block: 0, find: 'Basically the ', replace: 'The ' }))
    acceptSuggestions(view, ['s1'])
    const runs = []
    view.state.doc.descendants((node) => { if (node.isText) runs.push([node.text, node.marks.map(m => m.type.name)]) })
    expect(runs).toEqual([['The ', []], ['queue', ['code']], [' drains in order.', []]])
  })

  test('accepting an edit inside bold keeps it bold', () => {
    const view = fakeView(propose(withPlugin(parse('plain **very good bold** plain')), { block: 0, find: 'good', replace: 'fine' }))
    acceptSuggestions(view, ['s1'])
    const runs = []
    view.state.doc.descendants((node) => { if (node.isText) runs.push([node.text, node.marks.map(m => m.type.name)]) })
    expect(runs).toEqual([['plain ', []], ['very fine bold', ['strong']], [' plain', []]])
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

  test('a paragraph split inside the range makes it stale: accept skips it and the split survives', () => {
    let state = catState()
    state = state.apply(state.tr.split(6))                         // Enter inside "cat"
    expect(state.doc.childCount).toBe(2)
    const view = fakeView(state)
    const before = view.state.doc
    const result = acceptSuggestions(view, ['s1'])
    expect(result.accepted).toEqual([])
    expect(result.skipped[0].reason).toMatch(/stale/)
    expect(view.state.doc.eq(before)).toBe(true)
    expect(view.state.doc.childCount).toBe(2)
    expect(view.transactions).toEqual([])
  })

  test('a pending suggestion whose text is no longer find is skipped as stale edited, and the document is not touched', () => {
    // Positions 1..4 now hold "the", not the "cat" find recorded for them.
    const base = withPlugin(doc(p('the cat sat')))
    const bogus = { block: 0, from: 1, to: 4, find: 'cat', replace: 'dog', note: undefined }
    const state = base.apply(base.tr.setMeta(suggestionsKey, { add: [bogus] }))
    expect(getSuggestions(state).pending.length).toBe(1)
    const view = fakeView(state)
    const before = view.state.doc
    const result = acceptSuggestions(view, ['s1'])
    expect(result.accepted).toEqual([])
    expect(result.skipped.length).toBe(1)
    expect(result.skipped[0].reason).toMatch(/stale/)
    expect(view.state.doc.eq(before)).toBe(true)
    expect(view.transactions.every(tr => !tr.docChanged)).toBe(true)
    expect(view.events).toEqual([])
    expect(getSuggestions(view.state).pending).toEqual([])
    expect(getSuggestions(view.state).resolved).toEqual([
      { id: 's1', status: 'stale', reason: 'edited', find: 'cat', replace: 'dog', block: 0 }])
  })

  test('accepting a mixed batch applies the good suggestion and skips the one whose text changed', () => {
    const base = withPlugin(doc(p('the cat sat')))
    const good = { block: 0, from: 5, to: 8, find: 'cat', replace: 'dog' }
    const bad = { block: 0, from: 1, to: 4, find: 'cat', replace: 'dog' }
    const view = fakeView(base.apply(base.tr.setMeta(suggestionsKey, { add: [bad, good] })))
    const result = acceptSuggestions(view, ['s1', 's2'])
    expect(result.accepted).toEqual(['s2'])
    expect(result.skipped.map(x => x.id)).toEqual(['s1'])
    expect(view.state.doc.textContent).toBe('the dog sat')
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

  test('nextSuggestionTarget is the first suggestion at or after the caret, wrapping, and null when there is none', () => {
    const state = three()
    expect(state.selection.from).toBe(1)
    expect(state.selection.empty).toBe(true)
    expect(nextSuggestionTarget(state, 'next').id).toBe('s1')       // s1 starts exactly at the collapsed caret: not skipped
    const mid = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4)))
    expect(nextSuggestionTarget(mid, 'next').id).toBe('s2')         // caret at the start of s2
    const inside = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 5)))
    expect(nextSuggestionTarget(inside, 'next').id).toBe('s3')
    const atEnd = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 9)))
    expect(nextSuggestionTarget(atEnd, 'next').id).toBe('s1')       // wraps
    expect(nextSuggestionTarget(withPlugin(doc(p('x'))), 'next')).toBeNull()
  })

  test('a selection that exactly equals a suggestion\'s range does not answer with that suggestion', () => {
    const state = three()
    const onS2 = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4, 6)))
    expect(nextSuggestionTarget(onS2, 'next').id).toBe('s3')
    expect(nextSuggestionTarget(onS2, 'previous').id).toBe('s1')
    const onS1 = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 1, 3)))
    expect(nextSuggestionTarget(onS1, 'previous').id).toBe('s3')    // wraps backwards
    const onS3 = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 7, 9)))
    expect(nextSuggestionTarget(onS3, 'next').id).toBe('s1')        // wraps forwards
    // A selection that starts at s2 but is not exactly its range still finds s2.
    const longer = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4, 9)))
    expect(nextSuggestionTarget(longer, 'next').id).toBe('s2')
  })

  test('a lone suggestion that is already selected is answered again', () => {
    const state = propose(withPlugin(doc(p('a1 b2'))), { block: 0, find: 'b2', replace: 'B' })
    const selected = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 4, 6)))
    expect(nextSuggestionTarget(selected, 'next').id).toBe('s1')
    expect(nextSuggestionTarget(selected, 'previous').id).toBe('s1')
  })

  test('previousSuggestionTarget is the last suggestion at or before the caret, wrapping', () => {
    const state = three()
    expect(nextSuggestionTarget(state, 'previous').id).toBe('s1')   // s1 starts exactly at the caret: not skipped
    const mid = state.apply(state.tr.setSelection(TextSelection.create(state.doc, 6)))
    expect(nextSuggestionTarget(mid, 'previous').id).toBe('s2')
  })

  test('goToSuggestion selects the range, and next then previous round-trips', () => {
    const view = fakeView(three())
    const first = goToSuggestion(view, 'next')
    expect(first).toEqual({ found: true, id: 's1', block: 0 })      // the caret sits at the start of s1
    expect([view.state.selection.from, view.state.selection.to]).toEqual([1, 3])
    expect(goToSuggestion(view, 'next').id).toBe('s2')
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
    expect(goToSuggestion(view, 'next').id).toBe('s1')
    expect(goToSuggestion(view, 'next').id).toBe('s3')
  })
})

// ---------------------------------------------------------------------------
// decorations and widgets
// ---------------------------------------------------------------------------

/** The decorations the plugin gives for `state`, split into the inline ones and the widgets. */
function decorationsOf(state) {
  const plugin = suggestionsKey.get(state)
  const set = plugin.props.decorations.call(plugin, state)
  const found = set ? set.find() : []
  return { inline: found.filter(d => d.from !== d.to || d.type.attrs), widgets: found.filter(d => d.type.toDOM) }
}

describe('decorations', () => {
  test('one inline decoration over the range and one widget at its end per pending suggestion', () => {
    const state = threeInOne()
    const { inline, widgets } = decorationsOf(state)
    const pending = getSuggestions(state).pending
    expect(inline.map(d => [d.from, d.to])).toEqual(pending.map(s => [s.from, s.to]))
    expect(widgets.map(d => d.from)).toEqual(pending.map(s => s.to))
    expect(inline.map(d => d.type.attrs['data-suggestion-id'])).toEqual(['s1', 's2', 's3'])
    expect(inline.every(d => d.type.attrs.class === 'suggestion-old')).toBe(true)
  })

  test('none for resolved suggestions, and none without a plugin value to show', () => {
    let state = threeInOne()
    state = state.apply(state.tr.setMeta(suggestionsKey, { rejected: ['s1', 's2', 's3'] }))
    const { inline, widgets } = decorationsOf(state)
    expect(inline).toEqual([])
    expect(widgets).toEqual([])
  })

  test('they follow edits: after text is inserted before the range the decorations moved with it', () => {
    let state = catState()
    state = state.apply(state.tr.insertText('XX', 1))
    const { inline, widgets } = decorationsOf(state)
    expect([inline[0].from, inline[0].to]).toEqual([7, 10])
    expect(widgets[0].from).toBe(10)
  })

  test('the note becomes the title of the inline decoration, and no title without one', () => {
    const noted = propose(withPlugin(doc(p('one two'))), { block: 0, find: 'one', replace: '1', note: 'why: "quoted" <b>' })
    expect(decorationsOf(noted).inline[0].type.attrs.title).toBe('why: "quoted" <b>')
    const plain = propose(withPlugin(doc(p('one two'))), { block: 0, find: 'one', replace: '1' })
    expect('title' in decorationsOf(plain).inline[0].type.attrs).toBe(false)
  })

  test('the widget is not editable content and stops editor events', () => {
    const { widgets } = decorationsOf(catState())
    expect(widgets[0].spec.side).toBe(1)
    expect(widgets[0].spec.stopEvent()).toBe(true)
    expect(widgets[0].spec.ignoreSelection).toBe(true)
    expect(widgets[0].spec.key).toMatch(/^suggestion-s1:/)
  })

  test('the widget key changes with the replacement text', () => {
    const a = decorationsOf(propose(withPlugin(doc(p('one'))), { block: 0, find: 'one', replace: 'A' })).widgets[0].spec.key
    const b = decorationsOf(propose(withPlugin(doc(p('one'))), { block: 0, find: 'one', replace: 'B' })).widgets[0].spec.key
    expect(a).not.toBe(b)
  })
})

describe('buildWidget', () => {
  const suggestion = (replace, note) => ({ id: 's1', find: 'old', replace, note })

  test('shows the replacement and two labelled buttons', () => {
    const el = buildWidget(suggestion('new text'), fakeView(catState()))
    expect(el.tagName).toBe('SPAN')
    expect(el.classList.contains('suggestion-new')).toBe(true)
    expect(el.getAttribute('contenteditable')).toBe('false')
    const buttons = [...el.querySelectorAll('button')]
    expect(buttons.map(b => b.textContent)).toEqual(['Accept', 'Reject'])
    expect(buttons.map(b => b.getAttribute('type'))).toEqual(['button', 'button'])
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(['Accept suggestion', 'Reject suggestion'])
    expect(el.firstChild.textContent).toBe('new text')
  })

  test('hostile replacement and note text stay literal: no elements beyond the span and two buttons', () => {
    const html = '<img src=x onerror=alert(1)>'
    const note = '"><script>alert(2)</script>'
    const el = buildWidget(suggestion(html, note), fakeView(catState()))
    expect([...el.querySelectorAll('*')].map(e => e.tagName)).toEqual(['BUTTON', 'BUTTON'])
    expect(el.firstChild.nodeType).toBe(3)
    expect(el.firstChild.textContent).toBe(html)
    expect(el.getAttribute('title')).toBe(note)
    expect(el.innerHTML).not.toContain('<img')
    expect(el.innerHTML).not.toContain('<script')
  })

  test('hostile text in the deletion case and in labels cannot add elements either', () => {
    const el = buildWidget(suggestion('', '<b onmouseover=1>'), fakeView(catState()))
    expect(el.querySelector('b')).toBeNull()
    expect(el.getAttribute('title')).toBe('<b onmouseover=1>')
  })

  test('an empty replacement shows a muted "(delete)" marker instead of empty text', () => {
    const el = buildWidget(suggestion(''), fakeView(catState()))
    const marker = el.querySelector('.suggestion-delete')
    expect(marker.textContent).toBe('(delete)')
  })

  test('a widget with no note has no title', () => {
    expect(buildWidget(suggestion('x'), fakeView(catState())).hasAttribute('title')).toBe(false)
  })

  test('clicking Accept accepts that suggestion; clicking Reject rejects it', () => {
    const accepting = fakeView(catState())
    buildWidget(getSuggestions(accepting.state).pending[0], accepting).querySelector('button:first-of-type').click()
    expect(accepting.state.doc.textContent).toBe('the dog sat')
    expect(getSuggestions(accepting.state).resolved[0].status).toBe('accepted')

    const rejecting = fakeView(catState())
    const buttons = buildWidget(getSuggestions(rejecting.state).pending[0], rejecting).querySelectorAll('button')
    buttons[1].click()
    expect(rejecting.state.doc.textContent).toBe('the cat sat')
    expect(getSuggestions(rejecting.state).resolved[0].status).toBe('rejected')
  })

  test('mousedown on a button is default-prevented, so the editor keeps its selection', () => {
    const el = buildWidget(suggestion('x'), fakeView(catState()))
    for (const button of el.querySelectorAll('button')) {
      const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      button.dispatchEvent(event)
      expect(event.defaultPrevented).toBe(true)
    }
  })
})

describe('in a real EditorView', () => {
  test('the old text is struck inside span.suggestion-old and the widget follows it', () => {
    const host = document.createElement('div')
    const view = new EditorView(host, { state: catState() })
    try {
      const old = host.querySelector('span.suggestion-old')
      expect(old).not.toBeNull()
      expect(old.textContent).toBe('cat')
      expect(old.getAttribute('data-suggestion-id')).toBe('s1')
      const widget = host.querySelector('span.suggestion-new')
      expect(widget).not.toBeNull()
      expect(widget.textContent).toContain('dog')
      expect(old.nextSibling).toBe(widget)
      // Accepting through the widget's own button resolves it and removes both.
      widget.querySelector('button').click()
      expect(host.querySelector('span.suggestion-old')).toBeNull()
      expect(host.querySelector('span.suggestion-new')).toBeNull()
      expect(host.textContent).toContain('the dog sat')
    } finally {
      view.destroy()
    }
  })
})

describe('the stylesheet', () => {
  const css = readFileSync(path.resolve(import.meta.dirname, '../../MarkupEditorApp/Resources/markupeditor-app.css'), 'utf8')

  test('hides the replacement widget and the strike while exporting, so a PDF shows the original text', () => {
    const hideNew = css.match(/#editor\.Markup-exporting\s+\.suggestion-new\s*\{[^}]*display:\s*none/g) ?? []
    const plainOld = css.match(/#editor\.Markup-exporting\s+\.suggestion-old\s*\{[^}]*text-decoration:\s*none[^}]*background:\s*none/g) ?? []
    expect(hideNew.length).toBe(1)
    expect(plainOld.length).toBe(1)
  })

  test('styles the old text, the new text and the buttons, with a dark-mode variant', () => {
    expect(css).toMatch(/\.suggestion-old\s*\{[^}]*line-through/)
    expect(css).toMatch(/\.suggestion-new\s*\{/)
    expect(css).toMatch(/\.suggestion-new button\s*\{/)
    expect(css).toMatch(/prefers-color-scheme: dark\)\s*\{\s*\.suggestion-old\s*\{[^}]*\}\s*\.suggestion-new\s*\{/)
  })
})

// ---------------------------------------------------------------------------
// the MU surface
// ---------------------------------------------------------------------------

afterEach(() => vi.restoreAllMocks())

/** A fake view over a state WITHOUT the suggestions plugin, as the editor is before the first proposal. */
const plainView = (document) => fakeView(stateOf(document))
const active = (view) => vi.spyOn(MU, 'activeView').mockReturnValue(view)
const hashesOfDoc = (document) => describeBlocks(document, {}).blocks.map(b => b.hash)
const plugins = (state) => state.plugins.filter(pl => pl.spec.key === suggestionsKey)
const edit = (document, block, find, replace, extra = {}) => ({ block, expected: hashOf(document, block), find, replace, ...extra })

describe('ensureInstalled', () => {
  test('adds the plugin once, however many times it is called', () => {
    const view = plainView(doc(p('one')))
    expect(plugins(view.state).length).toBe(0)
    ensureInstalled(view)
    ensureInstalled(view)
    expect(plugins(view.state).length).toBe(1)
  })

  test('history and the user\'s earlier edits survive the reconfigure', () => {
    const view = plainView(doc(p('one')))
    view.dispatch(view.state.tr.insertText('X', 1))
    expect(undoDepth(view.state)).toBe(1)
    ensureInstalled(view)
    expect(undoDepth(view.state)).toBe(1)
    expect(undoOnce(view.state).doc.textContent).toBe('one')
  })
})

describe('lazy install in a real EditorView', () => {
  test('a view without the plugin gets it on the first proposal, and the decorations reach the DOM', () => {
    const document_ = doc(p('the cat sat'))
    const host = document.createElement('div')
    const view = new EditorView(host, { state: stateOf(document_) })
    try {
      active(view)
      expect(plugins(view.state).length).toBe(0)
      expect(host.querySelector('span.suggestion-old')).toBeNull()
      const result = JSON.parse(proposeEdits([edit(document_, 0, 'cat', 'dog')]))
      expect(result.results[0]).toEqual({ index: 0, status: 'proposed', id: 's1', block: 0 })
      expect(plugins(view.state).length).toBe(1)
      const old = host.querySelector('span.suggestion-old')
      expect(old).not.toBeNull()
      expect(old.textContent).toBe('cat')
      expect(host.querySelector('span.suggestion-new').textContent).toContain('dog')
      expect(view.state.doc.eq(document_)).toBe(true)
      expect(undoDepth(view.state)).toBe(0)
    } finally {
      view.destroy()
    }
  })
})

describe('proposeEdits', () => {
  test('with no active view it says so instead of throwing', () => {
    active(undefined)
    expect(JSON.parse(proposeEdits([]))).toEqual({ ok: false, reason: 'No active view' })
  })

  test('an exception inside becomes a refusal, never an exception across the bridge', () => {
    active({ get state() { throw new Error('boom') } })
    const result = JSON.parse(proposeEdits([{}]))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/boom/)
  })

  test('edits must be an array of 1 to 200', () => {
    active(plainView(doc(p('one'))))
    for (const bad of [undefined, null, 'x', {}, []]) {
      const result = JSON.parse(proposeEdits(bad))
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/edits must be an array of 1 to 200/)
    }
    expect(JSON.parse(proposeEdits(new Array(201).fill({}))).ok).toBe(false)
  })

  test('returns a result per edit, with ids and blocks for those proposed and a reason for the others', () => {
    const document = doc(p('one two'), p('three'))
    active(plainView(document))
    const result = JSON.parse(proposeEdits([
      edit(document, 0, 'one', '1'), edit(document, 1, 'nope', 'x'), edit(document, 1, 'three', '3', { note: 'n' }),
    ]))
    expect(result.ok).toBe(true)
    expect(result.results[0]).toEqual({ index: 0, status: 'proposed', id: 's1', block: 0 })
    expect(result.results[1]).toMatchObject({ index: 1, status: 'refused' })
    expect(result.results[1].reason).toMatch(/not found/)
    expect(result.results[2]).toEqual({ index: 2, status: 'proposed', id: 's2', block: 1 })
  })

  test('installs the plugin once, leaves the document and every block hash alone, and raises no input event', () => {
    const document = doc(p('one two'), p('three four'))
    const view = plainView(document)
    active(view)
    const hashes = hashesOfDoc(document)
    proposeEdits([edit(document, 0, 'one', '1')])
    proposeEdits([edit(document, 1, 'four', '4')])
    expect(plugins(view.state).length).toBe(1)
    expect(view.state.doc.eq(document)).toBe(true)
    expect(hashesOfDoc(view.state.doc)).toEqual(hashes)
    expect(view.events).toEqual([])
    expect(view.transactions.every(tr => !tr.docChanged)).toBe(true)
    expect(undoDepth(view.state)).toBe(0)
    expect(getSuggestions(view.state).pending.map(s => s.id)).toEqual(['s1', 's2'])
  })

  test('a batch where every edit is refused dispatches nothing and installs nothing', () => {
    const document = doc(p('one'))
    const view = plainView(document)
    active(view)
    const result = JSON.parse(proposeEdits([edit(document, 0, 'missing', 'x')]))
    expect(result.results[0].status).toBe('refused')
    expect(view.transactions).toEqual([])
    expect(plugins(view.state).length).toBe(0)
  })

  test('a second proposal that overlaps a pending one is refused', () => {
    const document = doc(p('the quick fox'))
    active(plainView(document))
    proposeEdits([edit(document, 0, 'quick', 'slow')])
    const result = JSON.parse(proposeEdits([edit(document, 0, 'quick fox', 'x')]))
    expect(result.results[0].reason).toMatch(/overlap/)
  })
})

describe('what a save and an export write', () => {
  test('is the original text: the document holds no suggestion markup while suggestions are pending', () => {
    const source = parse('# Title\n\nThe cat sat on the mat.\n\n* one\n* two')
    const view = plainView(source)
    active(view)
    const html = () => {
      const holder = globalThis.document.createElement('div')
      holder.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(view.state.doc.content))
      return holder.innerHTML
    }
    const markdown = () => makeSerializer(makeWarnings()).serialize(view.state.doc, { escapeExtraCharacters: /</g })
    const htmlBefore = html()
    const markdownBefore = markdown()
    const result = JSON.parse(proposeEdits([edit(source, 1, 'cat', 'dog', { note: 'prefer dogs' }), edit(source, 2, 'one', '1')]))
    expect(result.results.map(r => r.status)).toEqual(['proposed', 'proposed'])
    expect(getSuggestions(view.state).pending.length).toBe(2)
    expect(html()).toBe(htmlBefore)                       // what MU.getHTML serializes: state.doc, not the DOM
    expect(markdown()).toBe(markdownBefore)               // what an export serializes
    for (const out of [html(), markdown()]) {
      expect(out).not.toMatch(/suggestion/)
      expect(out).toContain('cat')
      expect(out).not.toContain('dog')
    }
  })
})

describe('listSuggestions', () => {
  const setup = () => {
    const document = doc(p('alpha beta gamma delta'))
    const view = plainView(document)
    active(view)
    proposeEdits([edit(document, 0, 'alpha', 'A', { note: 'first' }), edit(document, 0, 'beta', 'B'), edit(document, 0, 'gamma', 'G'), edit(document, 0, 'delta', 'D')])
    return view
  }
  const list = () => JSON.parse(listSuggestions())

  test('with no active view it says so; with no plugin installed it is an empty list', () => {
    active(undefined)
    expect(JSON.parse(listSuggestions())).toEqual({ ok: false, reason: 'No active view' })
    active(plainView(doc(p('x'))))
    expect(list()).toEqual({ ok: true, suggestions: [] })
  })

  test('shows pending, then accepted, rejected and stale after those events, in creation order', () => {
    const view = setup()
    expect(list().suggestions).toEqual([
      { id: 's1', status: 'pending', block: 0, find: 'alpha', replace: 'A', note: 'first' },
      { id: 's2', status: 'pending', block: 0, find: 'beta', replace: 'B' },
      { id: 's3', status: 'pending', block: 0, find: 'gamma', replace: 'G' },
      { id: 's4', status: 'pending', block: 0, find: 'delta', replace: 'D' },
    ])
    acceptSuggestions(view, ['s3'])
    rejectSuggestions(view, ['s2'])
    view.dispatch(view.state.tr.insertText('Z', 2))                // inside alpha
    expect(list().suggestions.map(x => [x.id, x.status, x.reason])).toEqual([
      ['s1', 'stale', 'edited'], ['s2', 'rejected', undefined], ['s3', 'accepted', undefined], ['s4', 'pending', undefined]])
    expect(list().suggestions[0]).toEqual({ id: 's1', status: 'stale', reason: 'edited', block: 0, find: 'alpha', replace: 'A', note: 'first' })
  })

  test('a replaced document leaves the records, reason document-replaced', () => {
    const view = setup()
    view.dispatch(view.state.tr.setSelection(new AllSelection(view.state.doc))
      .replaceSelectionWith(doc(p('fresh')), false).setMeta('addToHistory', false))
    const out = list().suggestions
    expect(out.length).toBe(4)
    expect(out.every(x => x.status === 'stale' && x.reason === 'document-replaced')).toBe(true)
  })

  test('ids keep counting after resolutions', () => {
    const view = setup()
    rejectAllSuggestions()
    const document = view.state.doc
    const more = JSON.parse(proposeEdits([edit(document, 0, 'alpha', 'A2')]))
    expect(more.results[0].id).toBe('s5')
  })
})

describe('navigation and bulk', () => {
  const setup = () => {
    const document = doc(p('a1 b2 c3'))
    const view = plainView(document)
    active(view)
    proposeEdits([edit(document, 0, 'a1', 'A'), edit(document, 0, 'b2', 'B'), edit(document, 0, 'c3', 'C')])
    return view
  }

  test('next and previous answer with the suggestion visited, or found false', () => {
    setup()
    expect(JSON.parse(nextSuggestion())).toEqual({ ok: true, found: true, id: 's1', block: 0 })
    expect(JSON.parse(nextSuggestion())).toEqual({ ok: true, found: true, id: 's2', block: 0 })
    expect(JSON.parse(previousSuggestion())).toEqual({ ok: true, found: true, id: 's1', block: 0 })
    active(plainView(doc(p('x'))))
    expect(JSON.parse(nextSuggestion())).toEqual({ ok: true, found: false })
    active(undefined)
    expect(JSON.parse(previousSuggestion())).toEqual({ ok: false, reason: 'No active view' })
  })

  test('accept all raises exactly one input event and is one undo step; reject all raises none', () => {
    const view = setup()
    expect(JSON.parse(acceptAllSuggestions())).toEqual({ ok: true, count: 3 })
    expect(view.state.doc.textContent).toBe('A B C')
    expect(view.events).toEqual(['input'])
    expect(undoDepth(view.state)).toBe(1)

    const second = setup()
    expect(JSON.parse(rejectAllSuggestions())).toEqual({ ok: true, count: 3 })
    expect(second.state.doc.textContent).toBe('a1 b2 c3')
    expect(second.events).toEqual([])
    expect(listSuggestionsOf(second)).toEqual(['rejected', 'rejected', 'rejected'])
  })

  test('with nothing pending both bulk commands count zero and change nothing', () => {
    const view = plainView(doc(p('x')))
    active(view)
    expect(JSON.parse(acceptAllSuggestions())).toEqual({ ok: true, count: 0 })
    expect(JSON.parse(rejectAllSuggestions())).toEqual({ ok: true, count: 0 })
    expect(view.transactions).toEqual([])
    expect(view.events).toEqual([])
  })

  function listSuggestionsOf(view) {
    active(view)
    return JSON.parse(listSuggestions()).suggestions.map(x => x.status)
  }
})

describe('interaction with replace_blocks', () => {
  test('replacing a block that holds a pending suggestion makes it stale, reason edited', () => {
    const document = doc(p('first'), p('the cat sat'), p('last'))
    const view = plainView(document)
    active(view)
    proposeEdits([edit(document, 1, 'cat', 'dog')])
    const plan = planReplace(view.state, { index: 1, count: 1, markdown: 'brand new text', expected: [hashOf(document, 1)], allowLoss: false })
    expect(plan.ok, plan.reason).toBe(true)
    view.dispatch(plan.tr)
    const out = JSON.parse(listSuggestions()).suggestions
    expect(out).toEqual([{ id: 's1', status: 'stale', reason: 'edited', block: 1, find: 'cat', replace: 'dog' }])
  })
})

describe('app.js wiring', () => {
  test('puts the six functions from suggestions.js on MU, not wrappers or look-alikes', async () => {
    await import('../src/app.js')
    const wired = { proposeEdits, listSuggestions, nextSuggestion, previousSuggestion, acceptAllSuggestions, rejectAllSuggestions }
    for (const [name, fn] of Object.entries(wired)) {
      expect(MU[name], name).toBe(fn)
    }
  })
})

describe('the source file', () => {
  test('writes the object-replacement character as an escape, not as an invisible literal', () => {
    const source = readFileSync(path.resolve(import.meta.dirname, '../src/suggestions.js'), 'utf8')
    expect(source).not.toContain('\uFFFC')
    expect(source).toContain('\\uFFFC')
  })
})
