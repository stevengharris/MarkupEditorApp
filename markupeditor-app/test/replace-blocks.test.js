import { describe, test, expect, vi, afterEach } from 'vitest'
import { MU, EditorState } from 'markupeditor'
import { history, undo, redo } from 'prosemirror-history'
import { makeParser } from '../src/parser.js'
import { makeSerializer } from '../src/serializer.js'
import { makeWarnings } from '../src/warnings.js'
import { describeBlocks, hashMarkdown } from '../src/doc-blocks.js'
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
  const { blocks } = describeBlocks(document, {})
  if (count > 0) return blocks.slice(index, index + count).map(b => b.hash)
  return index === 0 ? [] : [blocks[index - 1].hash]
}

/** Plan a change with the hashes read from the document, apply it, and return what happened. */
function run(document, index, count, markdown, { allowLoss = false, expected, ...options } = {}) {
  const state = stateOf(document)
  const result = planReplace(state, { index, count, markdown, expected: expected ?? expectedFor(document, index, count), allowLoss, ...options })
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
  const withHeader = () => doc(codeBlock('html', '<div>x</div>'), p('one'))
  const text = (document, index) => document.child(index).textContent

  test('the block next to the metadata block can be replaced', () => {
    const { result, doc: after } = run(withMetadata(), 1, 1, 'changed')
    expect(result.ok, result.reason).toBe(true)
    expect(kinds(after)).toEqual(['metadata', 'paragraph', 'paragraph'])
    expect(markdowns(after)).toEqual(['---\ntitle: x\n---', 'changed', 'two'])
  })

  test('an insert after the metadata block names the metadata block as the block before it', () => {
    const document = withMetadata()
    const { result, doc: after } = run(document, 1, 0, 'new first')
    expect(result.ok, result.reason).toBe(true)
    expect(markdowns(after)).toEqual(['---\ntitle: x\n---', 'new first', 'one', 'two'])
    expect(run(document, 1, 0, 'x', { expected: [] }).result.ok).toBe(false)
  })

  describe('front matter', () => {
    test.each([
      ['front matter', '---\ntitle: y\ntags: [a]\n---'],
      ['a fenced metadata block', '```metadata\ntitle: y\ntags: [a]\n```'],
    ])('replaces the metadata block with %s', (_, markdown) => {
      const { result, doc: after } = run(withMetadata(), 0, 1, markdown)
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['metadata', 'paragraph', 'paragraph'])
      expect(text(after, 0)).toBe('title: y\ntags: [a]')
      expect(result.metadataRemoved).toBeFalsy()
    })

    test('creates a metadata block at index 0, with the rest of the fragment after it', () => {
      const { result, doc: after } = run(doc(p('a'), p('b')), 0, 0, '---\ntitle: x\n---\n\nintro')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['metadata', 'paragraph', 'paragraph', 'paragraph'])
      expect(text(after, 0)).toBe('title: x')
      expect(markdowns(after).slice(1)).toEqual(['intro', 'a', 'b'])
      expect(result.range).toEqual({ index: 0, count: 2 })
    })

    test('creates one from front matter alone', () => {
      const { result, doc: after } = run(doc(p('a')), 0, 0, '---\ntitle: x\n---')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['metadata', 'paragraph'])
    })

    test('deleting the metadata block says it was removed', () => {
      const { result, doc: after } = run(withMetadata(), 0, 1, '')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['paragraph', 'paragraph'])
      expect(result.metadataRemoved).toBe(true)
    })

    test('replacing the metadata block with something else says it was removed', () => {
      const { result, doc: after } = run(withMetadata(), 0, 1, 'now a paragraph')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['paragraph', 'paragraph', 'paragraph'])
      expect(result.metadataRemoved).toBe(true)
    })

    test('a change that leaves the metadata block alone does not say it was removed', () => {
      expect(run(withMetadata(), 1, 1, 'x').result.metadataRemoved).toBeFalsy()
    })

    test('is refused anywhere but index 0', () => {
      for (const document of [doc(p('a'), p('b')), withMetadata()]) {
        const { result, doc: after } = run(document, 1, 1, '---\ntitle: x\n---')
        expect(result.ok).toBe(false)
        expect(result.reason).toMatch(/front matter.*index 0|index 0.*front matter/i)
        expect(after.eq(document)).toBe(true)
      }
    })

    test('is refused when it would create a second metadata block', () => {
      const document = withMetadata()
      const { result, doc: after } = run(document, 0, 0, '---\ntitle: x\n---')
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/metadata or HTML-preamble/)
      expect(after.eq(document)).toBe(true)
    })

    test('is refused when it has no keys', () => {
      const document = withMetadata()
      const { result, doc: after } = run(document, 0, 1, '```metadata\n\n```')
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/no keys|empty/i)
      expect(after.eq(document)).toBe(true)
    })

    test('a stale read of the metadata block is refused', () => {
      const document = withMetadata()
      const { result } = run(document, 0, 1, '---\ntitle: y\n---', { expected: [hashMarkdown('')] })
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/changed since/)
    })

    test('one undo restores it', () => {
      const document = withMetadata()
      const { after } = run(document, 0, 1, '---\ntitle: y\n---')
      let undone
      expect(undo(after, (tr) => { undone = after.apply(tr) })).toBe(true)
      expect(undone.doc.eq(document)).toBe(true)
    })
  })

  describe('the HTML header', () => {
    const banner = '<p align="center">\n    <img src="a.svg" width="96">\n</p>\n\n<p align="center">\n    <img src="b.svg">\n</p>'

    test('replaces an existing header with the leading HTML of the fragment', () => {
      const { result, doc: after } = run(withBoth(), 1, 1, '<div>new</div>')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['metadata', 'html-preamble', 'paragraph'])
      expect(text(after, 1)).toBe('<div>new</div>')
      expect(markdowns(after)[1]).toBe('<div>new</div>')
    })

    test('folds a run of HTML blocks into one header, with the rest of the fragment after it', () => {
      const { result, doc: after } = run(doc(p('a')), 0, 0, `${banner}\n\n# Title`)
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['html-preamble', 'heading', 'paragraph'])
      expect(text(after, 0).trim()).toBe(banner)
    })

    test('creates a header after the metadata block', () => {
      const { result, doc: after } = run(withMetadata(), 1, 0, '<div>hi</div>\n\ntext')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['metadata', 'html-preamble', 'paragraph', 'paragraph', 'paragraph'])
    })

    test('a fenced html block at the header position is the header', () => {
      const { result, doc: after } = run(doc(p('a')), 0, 0, '```html\n<div>x</div>\n```')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['html-preamble', 'paragraph'])
      expect(text(after, 0)).toBe('<div>x</div>')
    })

    test('deleting the header', () => {
      const { result, doc: after } = run(withBoth(), 1, 1, '')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['metadata', 'paragraph'])
      expect(result.metadataRemoved).toBeFalsy()
    })

    test('HTML that does not land at the header position is stripped as before, with a warning', () => {
      const { result, doc: after } = run(doc(p('a'), p('b')), 1, 0, '<div>x</div>\n\ntext')
      expect(result.ok, result.reason).toBe(true)
      expect(kinds(after)).toEqual(['paragraph', 'paragraph', 'paragraph'])
      expect(result.warnings.join(' ')).toMatch(/Raw HTML block stripped/)
    })

    test('is refused when it would leave a second header next to the first', () => {
      const document = withHeader()
      const { result, doc: after } = run(document, 0, 0, '<div>y</div>\n\ntext')
      expect(result.ok).toBe(false)
      expect(result.reason).toMatch(/metadata or HTML-preamble/)
      expect(after.eq(document)).toBe(true)
    })

    test('one undo restores it', () => {
      const document = withHeader()
      const { after } = run(document, 0, 1, '<div>y</div>')
      let undone
      expect(undo(after, (tr) => { undone = after.apply(tr) })).toBe(true)
      expect(undone.doc.eq(document)).toBe(true)
    })
  })

  test('a block that is not part of the change keeps its role: an insert at index 0 that would push the header out is refused', () => {
    const document = withHeader()
    const { result, doc: after } = run(document, 0, 0, 'a new first paragraph')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/metadata or HTML-preamble/)
    expect(after.eq(document)).toBe(true)
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
    const { result } = run(parse('# Intro\n\nb'), 1, 1, 'see [the intro](#intro)')
    expect(result.ok, result.reason).toBe(true)
    expect(result.warnings).toEqual([])
  })

  test('a new internal link that matches no heading is reported', () => {
    const { result } = run(doc(p('a'), p('b')), 1, 1, 'see [the intro](#intro)')
    expect(result.ok, result.reason).toBe(true)
    expect(result.warnings).toEqual(['Internal link target "#intro" does not match any heading'])
  })

  test('a link to # alone is neither reported nor given to a heading', () => {
    const empty = schema.nodes.heading.create({ level: 2 })
    const { result, doc: after } = run(doc(p('a'), empty), 0, 1, '[top](#)')
    expect(result.ok, result.reason).toBe(true)
    expect(result.warnings).toEqual([])
    expect(after.child(1).attrs.id ?? null).toBe(null)
  })

  describe('heading ids for internal links', () => {
    const idsOf = (document) => { const ids = []; document.descendants(n => { if (n.type.name === 'heading') ids.push(n.attrs.id ?? null) }); return ids }

    test('a new link gives the heading it targets an id', () => {
      const { result, doc: after } = run(parse('# Title\n\n## Features\n\nbody'), 3, 0, '[Features](#features)')
      expect(result.ok, result.reason).toBe(true)
      expect(idsOf(after)).toEqual([null, 'features'])
    })

    test('a new heading that an existing link targets gets its id', () => {
      const { result, doc: after } = run(parse('# Title\n\n[Setup](#setup)'), 2, 0, '## Setup')
      expect(result.ok, result.reason).toBe(true)
      expect(idsOf(after)).toEqual([null, 'setup'])
    })

    test('headings nothing links to stay without an id', () => {
      const { doc: after } = run(parse('# Title\n\n## Features'), 2, 0, 'plain')
      expect(idsOf(after)).toEqual([null, null])
    })

    test('a heading that already has the id keeps it and no other heading takes it', () => {
      const before = doc(schema.nodes.heading.create({ level: 2, id: 'features' }, schema.text('Features')),
        schema.nodes.heading.create({ level: 2 }, schema.text('Features')))
      const { doc: after } = run(before, 2, 0, '[Features](#features)')
      expect(idsOf(after)).toEqual(['features', null])
    })
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
  test('a fenced html or metadata block written at the start of a document that has neither creates it', () => {
    for (const [language, kind, content] of [['metadata', 'metadata', 'x: 1'], ['html', 'html-preamble', '<div>x</div>']]) {
      const { result, doc: after } = run(doc(p('a'), p('b')), 0, 0, '```' + language + '\n' + content + '\n```')
      expect(result.ok, language).toBe(true)
      expect(kinds(after)[0]).toBe(kind)
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

  test('deleting the block before a fenced html block is refused when the html block would become the header', () => {
    const document = doc(p('a'), codeBlock('html', '<b>x</b>'), p('c'))
    const { result, doc: after } = run(document, 0, 1, '')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/metadata or HTML-preamble/)
    expect(after.eq(document)).toBe(true)
  })

  test('a change that would leave only special blocks is refused', () => {
    const document = doc(codeBlock('metadata', 'title: x'), p('only'))
    const { result } = run(document, 1, 1, '')
    expect(result.ok).toBe(false)
  })

  test('replacing the last body block with an ordinary one next to metadata still works', () => {
    const document = doc(codeBlock('metadata', 'title: x'), p('only'))
    expect(run(document, 1, 1, 'new').result.ok).toBe(true)
  })
})

describe('a fragment that looks like front matter', () => {
  test.each([
    '---\ntitle: x\n---',
    '---\ntitle: x\ntags: [a]\n---\n\nbody',
    '---\n# a comment first\ntitle: x\n---',
  ])('is refused away from index 0: %j', (markdown) => {
    const document = doc(p('a'), p('b'))
    const { result, doc: after } = run(document, 1, 1, markdown)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/front matter/i)
    expect(after.eq(document)).toBe(true)
  })

  test('two rules around prose are rules, not front matter', () => {
    const prose = '---\n\nSection two.\n\n---\n\nSection three.'
    for (const index of [0, 1]) {
      const { result, doc: after } = run(doc(p('a'), p('b')), index, 0, prose)
      expect(result.ok, `index ${index}: ${result.reason}`).toBe(true)
      expect(kinds(after)).not.toContain('metadata')
    }
    expect(run(doc(p('a')), 0, 0, '---\ntext\n---').result.ok).toBe(true)
    expect(kinds(run(doc(p('a')), 0, 0, '---\ntext\n---').doc)).not.toContain('metadata')
  })

  test('indented fences are not front matter, as when a file opens', () => {
    expect(run(doc(p('a'), p('b')), 1, 1, '  ---\nauthor: me\n---\n').result.ok).toBe(true)
  })

  test('a rule between paragraphs is not front matter', () => {
    expect(run(doc(p('a'), p('b')), 1, 1, 'text\n\n---\n\nmore').result.ok).toBe(true)
    expect(run(doc(p('a'), p('b')), 1, 1, '---\n\nafter a rule').result.ok).toBe(true)
    expect(kinds(run(doc(p('a'), p('b')), 0, 0, '---\n\nafter a rule').doc)[0]).toBe('other')
  })
})

// ---------------------------------------------------------------------------
// what get_document returns for the special blocks is what replace_blocks accepts back
// ---------------------------------------------------------------------------

describe('the front matter and the header read back and are accepted unchanged', () => {
  const yamls = {
    'a comment first': '# note\ntitle: x',
    'a blank first line': '\ntitle: x',
    'a numeric key': '2024: x',
    'a quoted key': '"my key": x',
    'a dotted key': 'dc.title: x',
    'a list': 'tags:\n  - a\n  - b',
  }
  for (const [name, yaml] of Object.entries(yamls)) {
    test(`front matter with ${name}`, () => {
      const document = doc(codeBlock('metadata', yaml), p('body'))
      const block = describeBlocks(document, {}).blocks[0]
      const { result, doc: after } = run(document, 0, 1, block.markdown)
      expect(result.ok, result.reason).toBe(true)
      expect(after.eq(document)).toBe(true)
      expect(result.metadataRemoved).toBeFalsy()
    })
  }

  test('an empty metadata block reads as two rules and sending that back is refused, not mangled', () => {
    const document = doc(codeBlock('metadata', ''), p('body'))
    const block = describeBlocks(document, {}).blocks[0]
    const { result, doc: after } = run(document, 0, 1, block.markdown)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/no keys/i)
    expect(after.eq(document)).toBe(true)
  })

  test('front matter of only blank lines is refused', () => {
    const document = doc(codeBlock('metadata', 'a: 1'), p('body'))
    const { result } = run(document, 0, 1, '---\n   \n---')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/no keys/i)
  })

  test('a header reads back and is accepted unchanged', () => {
    const html = '<p align="center">\n  <img src="logo.svg" width="96">\n</p>\n\n<p align="center">\n  <img src="b.svg">\n</p>'
    const document = doc(codeBlock('html', html), p('body'))
    const block = describeBlocks(document, {}).blocks[0]
    const { result, doc: after } = run(document, 0, 1, block.markdown)
    expect(result.ok, result.reason).toBe(true)
    expect(after.eq(document)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// the HTML header is raw HTML saved into the file, so the image policy covers it
// ---------------------------------------------------------------------------

describe('the HTML header and the image policy', () => {
  const header = (html, options) => run(doc(p('a')), 0, 0, html, options)

  test('an image with a relative source is accepted', () => {
    expect(header('<p align="center"><img src="logo.svg" width="96"></p>').result.ok).toBe(true)
  })

  test.each([
    ['an image from a web address', '<img src="https://example.invalid/x.png?d=secret">'],
    ['an image from a protocol-relative address', '<img src="//example.invalid/x.png">'],
    ['a srcset', '<img src="a.png" srcset="b.png 1x, https://example.invalid/c.png 2x">'],
    ['a video poster', '<div><video poster="https://example.invalid/p.png"></video></div>'],
    ['a style attribute that loads a url', '<div style="background:url(https://example.invalid/x)">x</div>'],
    ['a style element', '<style>body{background:url(https://example.invalid/x)}</style>'],
    ['an entity-encoded scheme', '<div><img src="&#104;ttps://example.invalid/a.png"></div>'],
    ['a named-entity colon', '<div><img src="https&colon;//example.invalid/a.png"></div>'],
    ['an unquoted srcset', '<div><img src=a.png srcset=https://example.invalid/b.png></div>'],
    ['an svg image', '<div><svg><image href="https://example.invalid/a.png"></image></svg></div>'],
    ['an image-set', '<div style="background:image-set(\'https://example.invalid/a.png\' 1x)">x</div>'],
    ['a css escape', '<div style="background:u\\72l(https://example.invalid/a.png)">x</div>'],
    ['an import', '<style>@import "https://example.invalid/a.css";</style>'],
    ['an image hidden in a comment-like attribute value', '<div><img alt="x" src=" https://example.invalid/a.png"></div>'],
  ])('%s is refused while remote images are restricted, naming the setting', (_, html) => {
    const { result, doc: after } = header(html)
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/Settings|restrict/i)
    expect(after.childCount).toBe(1)
  })

  test('web addresses are accepted when the user has allowed remote images', () => {
    expect(header('<p><img src="https://example.invalid/x.png"></p>', { restrictImages: false }).result.ok).toBe(true)
    expect(header('<style>p{color:red}</style>', { restrictImages: false }).result.ok).toBe(true)
  })

  test.each([
    ['a script', '<script>alert(1)</script>'],
    ['an iframe', '<iframe src="page.html"></iframe>'],
    ['an object', '<div><object data="a.swf"></object></div>'],
    ['an event handler', '<img src="a.png" onerror="alert(1)">'],
    ['a javascript: link', '<div><a href="javascript:alert(1)">x</a></div>'],
    ['a base element', '<base href="https://example.invalid/">'],
    ['an entity-encoded javascript link', '<div><a href="&#106;avascript:alert(1)">x</a></div>'],
    ['a script inside an svg', '<div><svg><script>alert(1)</script></svg></div>'],
    ['a template wrapping a remote image', '<div><template><img src="https://example.invalid/a.png"></template></div>'],
    ['a template wrapping a frame', '<div><template><iframe src="https://example.invalid"></iframe></template></div>'],
  ])('%s is refused even when remote images are allowed', (_, html) => {
    const { result, doc: after } = header(html, { restrictImages: false })
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/cannot contain/i)
    expect(after.childCount).toBe(1)
  })

  test('the check covers a replaced header and a fenced html block as well', () => {
    const document = doc(codeBlock('html', '<div>x</div>'), p('a'))
    expect(run(document, 0, 1, '<img src="https://example.invalid/x.png">').result.ok).toBe(false)
    expect(run(doc(p('a')), 0, 0, '```html\n<script>x</script>\n```', { restrictImages: false }).result.ok).toBe(false)
  })

  test('links and relative sources are fine, and so are ordinary attributes', () => {
    const html = '<p align="center"><a href="https://example.invalid/page"><img src="logo.svg" alt="x" width="96" data-note="y"></a></p>'
    expect(header(html).result.ok).toBe(true)
  })

  test('a header that is already in the document is not checked when the change leaves it alone', () => {
    const document = doc(codeBlock('html', '<img src="https://example.invalid/x.png">'), p('one'), p('two'))
    expect(run(document, 2, 1, 'changed').result.ok).toBe(true)
  })

  test('a fenced html block at the header position must be HTML only', () => {
    const { result, doc: after } = run(doc(p('a')), 0, 0, '```html\n# Not html\n\n---\nk: v\n---\n```')
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/HTML blocks/)
    expect(after.childCount).toBe(1)
  })
})

describe('a leading HTML block is folded only when it opens the fragment', () => {
  test('a link reference definition before it is kept and the HTML goes through the parser', () => {
    const { result, doc: after } = run(doc(p('a')), 0, 0, '[ref]: http://example.invalid\n\n<div>x</div>\n\nSee [ref]')
    expect(result.ok, result.reason).toBe(true)
    expect(kinds(after)).not.toContain('html-preamble')
    expect(result.warnings.join(' ')).toMatch(/Raw HTML block stripped/)
    const see = after.child(0)
    expect(see.textContent).toBe('See ref')
    expect(see.lastChild.marks.map(m => m.type.name)).toContain('link')
  })
})

describe('documents that do not keep front matter or a header', () => {
  test('creating either is refused when the document type does not keep them', () => {
    const options = { allowSpecialBlocks: false }
    for (const markdown of ['---\ntitle: x\n---', '<div>x</div>']) {
      const document = doc(p('a'), p('b'))
      const { result, doc: after } = run(document, 0, 0, markdown, options)
      expect(result.ok, markdown).toBe(false)
      expect(result.reason).toMatch(/does not keep/i)
      expect(after.eq(document)).toBe(true)
    }
  })

  test('an ordinary change still works', () => {
    expect(run(doc(p('a'), p('b')), 1, 1, 'changed', { allowSpecialBlocks: false }).result.ok).toBe(true)
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
