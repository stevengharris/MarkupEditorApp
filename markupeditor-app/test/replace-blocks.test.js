import { describe, test, expect, vi, afterEach } from 'vitest'
import { MU, EditorState } from 'markupeditor'
import { history, undo, redo } from 'prosemirror-history'
import { makeParser } from '../src/parser.js'
import { makeSerializer } from '../src/serializer.js'
import { makeWarnings } from '../src/warnings.js'
import { describeBlocks } from '../src/doc-blocks.js'
import { planReplace, replaceBlocks } from '../src/replace-blocks.js'

const { schema } = MU

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const parse = (md) => makeParser(schema, makeWarnings()).parse(md)
const p = (text, marks) => schema.nodes.paragraph.create(null, [schema.text(text, marks)])
const codeBlock = (language, text) => schema.nodes.code_block.create({ language }, text ? [schema.text(text)] : [])
const doc = (...children) => schema.nodes.doc.create(null, children)
const stateOf = (document) => EditorState.create({ doc: document, plugins: [history()] })
const wholeMarkdown = (document) => makeSerializer(makeWarnings()).serialize(document, { escapeExtraCharacters: /</g })
const kinds = (document) => describeBlocks(document, {}).blocks.map(b => b.kind)
const markdowns = (document) => describeBlocks(document, {}).blocks.map(b => b.markdown)

/** The hashes replace_blocks wants for this call: the blocks replaced, or for an insert the block before. */
function expectedFor(document, index, count) {
  const { blocks, firstEditable } = describeBlocks(document, {})
  if (count > 0) return blocks.slice(index, index + count).map(b => b.hash)
  return index === firstEditable ? [] : [blocks[index - 1].hash]
}

/** Plan a change with the hashes read from the document, apply it, and return what happened. */
function run(document, index, count, markdown, { allowLoss = false, expected } = {}) {
  const state = stateOf(document)
  const result = planReplace(state, { index, count, markdown, expected: expected ?? expectedFor(document, index, count), allowLoss })
  const after = result.ok ? state.apply(result.tr) : state
  return { result, state, after, doc: after.doc }
}

afterEach(() => vi.restoreAllMocks())

const mixed = () => parse([
  '# Title', '', 'Intro paragraph.', '', '* one', '* two', '', '1. first', '2. second', '',
  '| A | B |', '| --- | --- |', '| 1 | 2 |', '', '```js', 'let x = 1', '```', '', '> quoted', '', '---',
].join('\n'))   // heading, paragraph, bullet-list, numbered-list, table, code, quote, other

// ---------------------------------------------------------------------------
// the block-kind matrix: what gets replaced
// ---------------------------------------------------------------------------

describe('replacing one block of each kind with a paragraph', () => {
  const kindsInOrder = ['heading', 'paragraph', 'bullet-list', 'numbered-list', 'table', 'code', 'quote', 'other']
  kindsInOrder.forEach((kind, index) => {
    test(`${kind} at index ${index}`, () => {
      const { result, doc: after } = run(mixed(), index, 1, 'Replacement text')
      expect(result.ok, result.reason).toBe(true)
      const expectedKinds = [...kindsInOrder]
      expectedKinds[index] = 'paragraph'
      expect(kinds(after)).toEqual(expectedKinds)
      expect(markdowns(after)[index]).toBe('Replacement text')
      // Every other block is untouched.
      const before = markdowns(mixed())
      markdowns(after).forEach((md, i) => { if (i !== index) expect(md).toBe(before[i]) })
    })
  })

  test('an image paragraph', () => {
    const image = schema.nodes.image.create({ src: 'cat.png', alt: 'cat' })
    const document = doc(p('before'), schema.nodes.paragraph.create(null, [image]), p('after'))
    const { result, doc: after } = run(document, 1, 1, 'Plain text now')
    expect(result.ok, result.reason).toBe(true)
    expect(kinds(after)).toEqual(['paragraph', 'paragraph', 'paragraph'])
    expect(markdowns(after)[1]).toBe('Plain text now')
  })
})

describe('the new block takes its type from the Markdown, not from what it replaces', () => {
  const into = [
    ['a heading', '## New heading', 'heading'],
    ['a bullet list', '* a\n* b', 'bullet-list'],
    ['a numbered list', '1. a\n2. b', 'numbered-list'],
    ['a table', '| X | Y |\n| --- | --- |\n| 1 | 2 |', 'table'],
    ['fenced code', '```py\nprint(1)\n```', 'code'],
    ['a quote', '> a quote', 'quote'],
    ['an image', '![alt](pic.png)', 'image'],
    ['a rule', '---', 'other'],
  ]
  for (const [name, md, kind] of into) {
    test(`a paragraph becomes ${name}`, () => {
      const { result, doc: after } = run(doc(p('one'), p('two'), p('three')), 1, 1, md)
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)[1]).toBe(kind)
      expect(after.childCount).toBe(3)
    })
  }

  test('a heading becomes a plain paragraph (a paste over a heading would keep the heading)', () => {
    const { doc: after } = run(parse('# Heading\n\nBody'), 0, 1, 'Now just text')
    expect(kinds(after)).toEqual(['paragraph', 'paragraph'])
  })

  test('a paragraph becomes a heading', () => {
    const { doc: after } = run(parse('Body\n\nMore'), 0, 1, '### Now a heading')
    expect(kinds(after)).toEqual(['heading', 'paragraph'])
    expect(after.child(0).attrs.level).toBe(3)
  })

  test('a whole list is replaced as one block, not item by item', () => {
    const { doc: after } = run(parse('before\n\n* a\n* b\n* c\n\nafter'), 1, 1, 'gone')
    expect(markdowns(after)).toEqual(['before', 'gone', 'after'])
  })

  test('several blocks are replaced by one, and one by several', () => {
    const three = doc(p('a'), p('b'), p('c'), p('d'), p('e'))
    expect(markdowns(run(three, 1, 3, 'only').doc)).toEqual(['a', 'only', 'e'])
    expect(markdowns(run(three, 2, 1, 'x\n\ny\n\n* z').doc)).toEqual(['a', 'b', 'x', 'y', '* z', 'd', 'e'])
  })
})

// ---------------------------------------------------------------------------
// insert (count = 0) and append
// ---------------------------------------------------------------------------

describe('inserting beside lists and tables does not nest the new content', () => {
  test('a paragraph before a list', () => {
    const document = parse('para\n\n* a\n* b')
    const { result, doc: after } = run(document, 1, 0, 'inserted')
    expect(result.ok, result.reason).toBe(true)
    expect(kinds(after)).toEqual(['paragraph', 'paragraph', 'bullet-list'])
    expect(markdowns(after)[2]).toBe(markdowns(document)[1])
  })

  test('a paragraph after a list', () => {
    const document = parse('* a\n* b\n\npara')
    const { doc: after } = run(document, 1, 0, 'inserted')
    expect(kinds(after)).toEqual(['bullet-list', 'paragraph', 'paragraph'])
    expect(after.child(0).childCount).toBe(2)
  })

  test('a list right after a list stays a separate top-level list', () => {
    const { doc: after } = run(parse('* a\n* b'), 1, 0, '* c\n* d')
    expect(kinds(after)).toEqual(['bullet-list', 'bullet-list'])
    expect(after.child(0).childCount).toBe(2)
    expect(after.child(1).childCount).toBe(2)
  })

  test('a paragraph beside a table', () => {
    const document = parse('| A | B |\n| --- | --- |\n| 1 | 2 |\n\nafter')
    const { doc: after } = run(document, 1, 0, 'between')
    expect(kinds(after)).toEqual(['table', 'paragraph', 'paragraph'])
  })
})

describe('inserting and appending', () => {
  test('insert at the start of the document', () => {
    const { result, doc: after } = run(doc(p('a'), p('b')), 0, 0, 'first')
    expect(result.ok, result.reason).toBe(true)
    expect(markdowns(after)).toEqual(['first', 'a', 'b'])
  })

  test('insert in the middle, naming the block just before', () => {
    expect(markdowns(run(doc(p('a'), p('b'), p('c')), 2, 0, 'new').doc)).toEqual(['a', 'b', 'new', 'c'])
  })

  test('append: an index equal to the number of blocks', () => {
    const { result, doc: after } = run(doc(p('a'), p('b')), 2, 0, 'last')
    expect(result.ok, result.reason).toBe(true)
    expect(markdowns(after)).toEqual(['a', 'b', 'last'])
  })

  test('append after a table, a list and a code block', () => {
    for (const md of ['| A |\n| --- |\n| 1 |', '* a', '```\ncode\n```']) {
      const document = parse(md)
      const { result, doc: after } = run(document, 1, 0, 'tail')
      expect(result.ok, result.reason).toBe(true)
      expect(after.lastChild.textContent).toBe('tail')
    }
  })

  test('the result reports the new block range and the Markdown of the blocks that changed', () => {
    const { result } = run(doc(p('a'), p('b'), p('c')), 1, 1, 'x\n\ny')
    expect(result.range).toEqual({ index: 1, count: 2 })
    expect(result.blocks.map(b => [b.index, b.markdown])).toEqual([[1, 'x'], [2, 'y']])
    expect(result.warnings).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// delete
// ---------------------------------------------------------------------------

describe('deleting', () => {
  test('an empty Markdown with a count deletes those blocks', () => {
    const document = doc(p('a'), p('b'), p('c'), p('d'))
    expect(markdowns(run(document, 1, 2, '').doc)).toEqual(['a', 'd'])
    expect(markdowns(run(document, 0, 1, '').doc)).toEqual(['b', 'c', 'd'])
    expect(markdowns(run(document, 3, 1, '').doc)).toEqual(['a', 'b', 'c'])
  })

  test('whitespace-only Markdown also deletes', () => {
    expect(markdowns(run(doc(p('a'), p('b')), 0, 1, '  \n\n ').doc)).toEqual(['b'])
  })

  test('the result of a delete has no new blocks and a range of zero', () => {
    const { result } = run(doc(p('a'), p('b')), 0, 1, '')
    expect(result.ok).toBe(true)
    expect(result.range).toEqual({ index: 0, count: 0 })
    expect(result.blocks).toEqual([])
  })

  test('deleting every block is refused and nothing changes', () => {
    const document = doc(p('a'), p('b'))
    const { result, doc: after } = run(document, 0, 2, '')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/every block|at least one/i)
    expect(after.eq(document)).toBe(true)
  })

  test('replacing every block with new content is fine', () => {
    expect(markdowns(run(doc(p('a'), p('b')), 0, 2, 'all new').doc)).toEqual(['all new'])
  })

  test('the only block can be replaced but not deleted', () => {
    const only = doc(p('a'))
    expect(run(only, 0, 1, '').result.ok).toBe(false)
    expect(markdowns(run(only, 0, 1, 'b').doc)).toEqual(['b'])
  })
})

// ---------------------------------------------------------------------------
// the blocks that are special at the start of the document
// ---------------------------------------------------------------------------

describe('metadata and HTML-preamble blocks', () => {
  const withMetadata = () => doc(codeBlock('metadata', 'title: x'), p('one'), p('two'))
  const withBoth = () => doc(codeBlock('metadata', 'a: 1'), codeBlock('html', '<p>raw</p>'), p('one'))

  test('the block next to the metadata block can be replaced', () => {
    const { result, doc: after } = run(withMetadata(), 1, 1, 'changed')
    expect(result.ok, result.reason).toBe(true)
    expect(kinds(after)).toEqual(['metadata', 'paragraph', 'paragraph'])
    expect(markdowns(after)).toEqual(['', 'changed', 'two'])
  })

  test('insert at firstEditable names no block before it', () => {
    const { result, doc: after } = run(withMetadata(), 1, 0, 'new first')
    expect(result.ok, result.reason).toBe(true)
    expect(markdowns(after)).toEqual(['', 'new first', 'one', 'two'])
  })

  test('replacing, deleting or inserting before firstEditable is refused', () => {
    for (const [index, count, md] of [[0, 1, 'x'], [0, 1, ''], [0, 0, 'x']]) {
      const document = withMetadata()
      const { result, doc: after } = run(document, index, count, md, { expected: count > 0 ? expectedFor(document, index, count) : [] })
      expect(result.ok, `index ${index} count ${count}`).toBe(false)
      expect(result.reason).toMatch(/metadata|before the first editable|firstEditable/i)
      expect(after.eq(document)).toBe(true)
    }
  })

  test('with a metadata block and an HTML preamble, both are protected and firstEditable is 2', () => {
    const document = withBoth()
    expect(describeBlocks(document, {}).firstEditable).toBe(2)
    expect(run(document, 1, 1, 'x', { expected: expectedFor(document, 1, 1) }).result.ok).toBe(false)
    expect(run(document, 2, 1, 'edited').result.ok).toBe(true)
    expect(markdowns(run(document, 2, 0, 'inserted').doc)).toEqual(['', '<p>raw</p>', 'inserted', 'one'])
  })

  test('an HTML preamble alone protects index 0', () => {
    const document = doc(codeBlock('html', '<div>x</div>'), p('one'))
    expect(run(document, 0, 1, 'x', { expected: expectedFor(document, 0, 1) }).result.ok).toBe(false)
    expect(run(document, 1, 1, 'ok').result.ok).toBe(true)
  })

  test('the same fenced block further into a fragment is accepted as ordinary code', () => {
    const { result, doc: after } = run(doc(p('a'), p('b')), 1, 1, 'text\n\n```metadata\nx: 1\n```')
    expect(result.ok, result.reason).toBe(true)
    expect(kinds(after)).toEqual(['paragraph', 'paragraph', 'code'])
  })
})

// ---------------------------------------------------------------------------
// the hash check
// ---------------------------------------------------------------------------

describe('expected hashes', () => {
  test('a stale hash refuses the whole call, changes nothing, and returns the current blocks', () => {
    const document = doc(p('a'), p('b'), p('c'))
    const stale = expectedFor(document, 1, 1)
    const edited = doc(p('a'), p('B was edited'), p('c'))
    const { result, doc: after } = run(edited, 1, 1, 'mine', { expected: stale })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/changed/i)
    expect(result.blocks.map(b => [b.index, b.markdown])).toEqual([[1, 'B was edited']])
    expect(after.eq(edited)).toBe(true)
  })

  test('one stale hash among several refuses all of them', () => {
    const document = doc(p('a'), p('b'), p('c'), p('d'))
    const expected = expectedFor(document, 1, 3)
    expected[2] = 'f'.repeat(14)
    const { result, doc: after } = run(document, 1, 3, 'x', { expected })
    expect(result.ok).toBe(false)
    expect(result.blocks.map(b => b.index)).toEqual([1, 2, 3])
    expect(after.eq(document)).toBe(true)
  })

  test('an insert checks the block just before it', () => {
    const document = doc(p('a'), p('b'))
    const { result, doc: after } = run(document, 1, 0, 'x', { expected: ['0'.repeat(14)] })
    expect(result.ok).toBe(false)
    expect(result.blocks.map(b => b.index)).toEqual([0, 1])
    expect(after.eq(document)).toBe(true)
  })

  test('the hash check runs before the loss check, so a stale call learns it is stale', () => {
    const underline = schema.marks.u.create()
    const document = doc(p('lossy', [underline]))
    const { result } = run(document, 0, 1, 'x', { expected: ['0'.repeat(14)] })
    expect(result.reason).toMatch(/changed/i)
  })
})

// ---------------------------------------------------------------------------
// replacing a block that cannot be written as Markdown without loss
// ---------------------------------------------------------------------------

describe('blocks with export warnings', () => {
  const underline = () => schema.marks.u.create()
  const lossy = () => doc(p('keep'), p('underlined', [underline()]), p('tail'))

  test('replacing such a block is refused unless allowLoss is true, and the reply names the warnings', () => {
    const document = lossy()
    const { result, doc: after } = run(document, 1, 1, 'new')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/allowLoss/)
    expect(result.blocks.map(b => b.index)).toEqual([1])
    expect(result.blocks[0].warnings.length).toBe(1)
    expect(after.eq(document)).toBe(true)
  })

  test('with allowLoss the replace goes through', () => {
    const { result, doc: after } = run(lossy(), 1, 1, 'new', { allowLoss: true })
    expect(result.ok, result.reason).toBe(true)
    expect(markdowns(after)).toEqual(['keep', 'new', 'tail'])
  })

  test('deleting such a block needs allowLoss too', () => {
    expect(run(lossy(), 1, 1, '').result.ok).toBe(false)
    expect(run(lossy(), 1, 1, '', { allowLoss: true }).result.ok).toBe(true)
  })

  test('only allowLoss === true counts', () => {
    expect(run(lossy(), 1, 1, 'new', { allowLoss: 'yes' }).result.ok).toBe(false)
  })

  test('an insert replaces nothing, so it never needs allowLoss', () => {
    expect(run(lossy(), 2, 0, 'inserted after the lossy block').result.ok).toBe(true)
  })

  test('a block without warnings next to a lossy one does not need allowLoss', () => {
    expect(run(lossy(), 0, 1, 'new').result.ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// arguments are validated, not clamped
// ---------------------------------------------------------------------------

describe('argument validation', () => {
  const document = () => doc(p('a'), p('b'), p('c'))
  const hashes = (index, count) => expectedFor(document(), index, count)

  const bad = [
    ['a negative index', { index: -1, count: 1, markdown: 'x' }],
    ['a fractional index', { index: 0.5, count: 1, markdown: 'x' }],
    ['an index that is not a number', { index: '1', count: 1, markdown: 'x' }],
    ['an index past the append position', { index: 4, count: 0, markdown: 'x' }],
    ['a replace at the append position', { index: 3, count: 1, markdown: 'x' }],
    ['a negative count', { index: 1, count: -1, markdown: 'x' }],
    ['a fractional count', { index: 1, count: 1.5, markdown: 'x' }],
    ['a count that passes the end', { index: 2, count: 2, markdown: 'x' }],
    ['Markdown that is not a string', { index: 1, count: 1, markdown: 5 }],
    ['an empty Markdown insert', { index: 1, count: 0, markdown: '' }],
    ['a whitespace-only insert', { index: 1, count: 0, markdown: '  \n ' }],
  ]
  for (const [name, args] of bad) {
    test(`${name} is refused with a reason and nothing changes`, () => {
      const doc0 = document()
      const state = stateOf(doc0)
      const result = planReplace(state, { expected: args.count > 0 ? hashes(1, 1) : [], allowLoss: false, ...args })
      expect(result.ok).toBe(false)
      expect(typeof result.reason).toBe('string')
      expect(result.tr).toBeUndefined()
    })
  }

  const badExpected = [
    ['a missing expected', undefined, 1, 1],
    ['expected that is not an array', 'abc', 1, 1],
    ['too few hashes for a replace', [], 1, 1],
    ['too many hashes for a replace', ['a', 'b'], 1, 1],
    ['a hash that is not a string', [7], 1, 1],
    ['a hash for an insert at the start', ['x'], 0, 0],
    ['no hash for an insert after a block', [], 1, 0],
    ['two hashes for an insert', ['x', 'y'], 1, 0],
  ]
  for (const [name, expected, index, count] of badExpected) {
    test(`${name} is refused`, () => {
      const result = planReplace(stateOf(document()), { index, count, markdown: 'x', expected, allowLoss: false })
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/expected/)
    })
  }

  test('count zero at an index equal to the block count appends and needs the last block\'s hash', () => {
    const d = document()
    expect(planReplace(stateOf(d), { index: 3, count: 0, markdown: 'x', expected: expectedFor(d, 3, 0), allowLoss: false }).ok).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// import warnings
// ---------------------------------------------------------------------------

describe('what the import says', () => {
  test('raw HTML the editor cannot hold is dropped and reported', () => {
    const { result, doc: after } = run(doc(p('a'), p('b')), 1, 1, '<div>hi</div>\n\nkept')
    expect(result.ok, result.reason).toBe(true)
    expect(markdowns(after)).toEqual(['a', 'kept'])
    expect(result.warnings).toEqual(['Raw HTML block stripped (not supported in MarkupEditor): <div>hi</div>'])
  })

  test('no warning about an internal link whose heading is elsewhere in the document', () => {
    const { result } = run(doc(p('a'), p('b')), 1, 1, 'see [the intro](#intro)')
    expect(result.ok, result.reason).toBe(true)
    expect(result.warnings).toEqual([])
  })

  test('Windows line endings are accepted', () => {
    const { doc: after } = run(doc(p('a'), p('b')), 1, 1, 'one\r\n\r\ntwo')
    expect(markdowns(after)).toEqual(['a', 'one', 'two'])
  })
})

// ---------------------------------------------------------------------------
// one transaction, one undo step
// ---------------------------------------------------------------------------

describe('one undo step', () => {
  const cases = {
    'a replace': (d) => [d, 1, 1, 'new one\n\nnew two'],
    'an insert': (d) => [d, 1, 0, 'inserted\n\n* and a list'],
    'a delete': (d) => [d, 1, 1, ''],
    'an append': (d) => [d, d.childCount, 0, 'appended'],
  }
  for (const [name, args] of Object.entries(cases)) {
    test(`${name} is one transaction and one undo restores the document exactly`, () => {
      const [document, index, count, md] = args(doc(p('a'), p('b'), p('c')))
      const state = stateOf(document)
      const result = planReplace(state, { index, count, markdown: md, expected: expectedFor(document, index, count), allowLoss: false })
      expect(result.ok, result.reason).toBe(true)
      expect(result.tr.steps.length).toBe(1)
      const changed = state.apply(result.tr)
      expect(changed.doc.eq(document)).toBe(false)
      let undone
      expect(undo(changed, (tr) => { undone = changed.apply(tr) })).toBe(true)
      expect(undone.doc.eq(document)).toBe(true)
      let redone
      expect(redo(undone, (tr) => { redone = undone.apply(tr) })).toBe(true)
      expect(redone.doc.eq(changed.doc)).toBe(true)
    })
  }

  // History joins two changes into one undo event when they come within a short time of each other and touch
  // neighboring text, so these put the typing inside the block that the change replaces or has just written.
  test('the change is its own undo event even when it comes straight after typing in the block it replaces', () => {
    const document = doc(p('abc'), p('def'))
    let state = stateOf(document)
    state = state.apply(state.tr.insertText('X', 6))                  // the user types inside the second paragraph
    const typed = state.doc
    expect(typed.child(1).textContent).toBe('Xdef')
    const result = planReplace(state, { index: 1, count: 1, markdown: 'new', expected: expectedFor(typed, 1, 1), allowLoss: false })
    state = state.apply(result.tr)
    let undone
    undo(state, (tr) => { undone = state.apply(tr) })
    expect(undone.doc.eq(typed)).toBe(true)                            // only the replace is undone, the typing stays
  })
})

describe('replaceBlocks (the MU function)', () => {
  function fakeView(document) {
    const events = []
    const view = { state: stateOf(document), dispatched: 0, events, dom: { dispatchEvent(event) { events.push(event.type) } }, dispatch(tr) { view.dispatched++; view.state = view.state.apply(tr) } }
    return view
  }
  const hashesOf = (document, index, count) => expectedFor(document, index, count)

  test('with no active view it says so instead of throwing', () => {
    vi.spyOn(MU, 'activeView').mockReturnValue(undefined)
    expect(JSON.parse(replaceBlocks(0, 1, 'x', ['h'], false))).toEqual({ ok: false, reason: 'No active view' })
  })

  test('changes the active view\'s document and returns JSON', () => {
    const document = doc(p('a'), p('b'))
    const view = fakeView(document)
    vi.spyOn(MU, 'activeView').mockReturnValue(view)
    const raw = replaceBlocks(1, 1, 'changed', hashesOf(document, 1, 1), false)
    expect(typeof raw).toBe('string')
    const result = JSON.parse(raw)
    expect(result.ok).toBe(true)
    expect(result.range).toEqual({ index: 1, count: 1 })
    expect(markdowns(view.state.doc)).toEqual(['a', 'changed'])
  })

  test('a change tells the editor its content changed, so the document is marked as edited; a refusal does not', () => {
    const document = doc(p('a'), p('b'))
    const view = fakeView(document)
    vi.spyOn(MU, 'activeView').mockReturnValue(view)
    replaceBlocks(1, 1, 'changed', ['0'.repeat(14)], false)
    expect(view.events).toEqual([])
    replaceBlocks(1, 1, 'changed', hashesOf(document, 1, 1), false)
    expect(view.events).toEqual(['input'])
  })

  test('a refusal changes nothing and dispatches nothing', () => {
    const document = doc(p('a'), p('b'))
    const view = fakeView(document)
    vi.spyOn(MU, 'activeView').mockReturnValue(view)
    const result = JSON.parse(replaceBlocks(1, 1, 'changed', ['0'.repeat(14)], false))
    expect(result.ok).toBe(false)
    expect(view.dispatched).toBe(0)
    expect(view.state.doc.eq(document)).toBe(true)
  })

  test('typing right after the change, inside the block it wrote, is a separate undo event', () => {
    const document = doc(p('abc'), p('def'))
    const view = fakeView(document)
    vi.spyOn(MU, 'activeView').mockReturnValue(view)
    replaceBlocks(1, 1, 'new', hashesOf(document, 1, 1), false)
    const replaced = view.state.doc
    view.dispatch(view.state.tr.insertText('X', 6))                   // the user types inside the new block
    expect(view.state.doc.child(1).textContent).toBe('Xnew')
    let undone
    undo(view.state, (tr) => { undone = view.state.apply(tr) })
    expect(undone.doc.eq(replaced)).toBe(true)                         // undo removes only the typing
  })

  test('an exception inside becomes a refusal, never an exception across the bridge', () => {
    vi.spyOn(MU, 'activeView').mockReturnValue({ get state() { throw new Error('boom') }, dispatch() {} })
    const result = JSON.parse(replaceBlocks(0, 1, 'x', ['h'], false))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/boom/)
  })
})

// ---------------------------------------------------------------------------
// round trip through the Markdown the document gives out
// ---------------------------------------------------------------------------

describe('the document stays well formed', () => {
  test('after a replace, the document Markdown is the unchanged blocks and the new content in order', () => {
    const before = mixed()
    const { doc: after } = run(before, 3, 2, 'Only this remains\n\n## and a heading')
    const expected = markdowns(before)
    expected.splice(3, 2, 'Only this remains', '## and a heading')
    expect(markdowns(after)).toEqual(expected)
    // The whole document re-reads to the same blocks.
    expect(markdowns(parse(wholeMarkdown(after)))).toEqual(expected)
  })
})

// ---------------------------------------------------------------------------
// what a change must not do to the start of the document
// ---------------------------------------------------------------------------

describe('a change keeps the special blocks at the start as they were', () => {
  test('a fenced html or metadata block written where it would become the preamble or metadata is refused', () => {
    for (const language of ['metadata', 'html']) {
      const document = doc(p('a'), p('b'))
      const { result, doc: after } = run(document, 0, 1, '```' + language + '\nx: 1\n```')
      expect(result.ok, language).toBe(false)
      expect(result.reason).toMatch(/start of the document/)
      expect(after.eq(document)).toBe(true)
    }
  })

  test('a fenced html block in the middle of a document is ordinary code and can be written back', () => {
    const document = doc(p('intro'), codeBlock('html', '<b>x</b>'), p('end'))
    const block = describeBlocks(document, {}).blocks[1]
    expect(block.kind).toBe('code')
    const { result, doc: after } = run(document, 1, 1, block.markdown)
    expect(result.ok, result.reason).toBe(true)
    expect(kinds(after)).toEqual(['paragraph', 'code', 'paragraph'])
  })

  test('deleting the block before a fenced html block is refused when the html block would become the preamble', () => {
    const document = doc(p('a'), codeBlock('html', '<b>x</b>'), p('c'))
    const { result, doc: after } = run(document, 0, 1, '')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/start of the document/)
    expect(after.eq(document)).toBe(true)
  })

  test('a change that would leave only the metadata block is refused', () => {
    const document = doc(codeBlock('metadata', 'title: x'), p('only'))
    const { result } = run(document, 1, 1, '')
    expect(result.ok).toBe(false)
  })

  test('replacing the last editable block with an ordinary one next to metadata still works', () => {
    const document = doc(codeBlock('metadata', 'title: x'), p('only'))
    expect(run(document, 1, 1, 'new').result.ok).toBe(true)
  })
})

describe('a fragment that looks like front matter', () => {
  test.each([
    '---\ntitle: x\n---',
    '---\ntitle: x\ntags: [a]\n---\n\nbody',
    '  ---\nauthor: me\n---\n',
  ])('is refused: %j', (markdown) => {
    const document = doc(p('a'), p('b'))
    const { result, doc: after } = run(document, 1, 1, markdown)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/front matter/)
    expect(after.eq(document)).toBe(true)
  })

  test('a rule between paragraphs is not front matter', () => {
    expect(run(doc(p('a'), p('b')), 1, 1, 'text\n\n---\n\nmore').result.ok).toBe(true)
    expect(run(doc(p('a'), p('b')), 1, 1, '---\n\nafter a rule').result.ok).toBe(true)
  })
})

describe('adjacent lists', () => {
  test('a change that leaves two lists of one type next to each other says they will merge when saved', () => {
    const document = parse('* a\n\npara\n\n* b')
    const { result } = run(document, 1, 1, '')
    expect(result.ok, result.reason).toBe(true)
    expect(result.warnings.join(' ')).toMatch(/merge/)
  })

  test('appending a list after a list of the same type warns', () => {
    const document = parse('* a')
    const { result } = run(document, 1, 0, '* b')
    expect(result.warnings.join(' ')).toMatch(/merge/)
  })

  test('lists of different types or separated by a block do not warn', () => {
    expect(run(parse('* a\n\npara'), 1, 0, '1. b').result.warnings).toEqual([])
    expect(run(parse('* a\n\npara'), 2, 0, '* b').result.warnings).toEqual([])
  })
})
