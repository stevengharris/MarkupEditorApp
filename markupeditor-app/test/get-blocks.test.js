import { describe, test, expect, vi, afterEach } from 'vitest'
import { MU } from 'markupeditor'
import { makeParser } from '../src/parser.js'
import { makeSerializer } from '../src/serializer.js'
import { makeWarnings } from '../src/warnings.js'
import { describeBlocks, hashMarkdown, getBlocks } from '../src/doc-blocks.js'

const { schema } = MU

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parse(md) {
  return makeParser(schema, makeWarnings()).parse(md)
}

function documentMarkdown(doc) {
  return makeSerializer(makeWarnings()).serialize(doc, { escapeExtraCharacters: /</g })
}

const p = (text, marks) => schema.nodes.paragraph.create(null, [schema.text(text, marks)])
const codeBlock = (language, text) => schema.nodes.code_block.create({ language }, text ? [schema.text(text)] : [])
const doc = (...children) => schema.nodes.doc.create(null, children)

/**
 * The document's Markdown must be the blocks' Markdown in order with nothing but newlines between
 * and around them. Blocks with empty Markdown (the metadata block) are skipped.
 */
function expectBlocksTileTheDocument(document) {
  const whole = documentMarkdown(document)
  const { blocks } = describeBlocks(document, {})
  let position = 0
  for (const block of blocks) {
    if (block.markdown === '') continue
    const at = whole.indexOf(block.markdown, position)
    expect(at, `block ${block.index} not found after position ${position}`).toBeGreaterThanOrEqual(0)
    expect(whole.slice(position, at), `text between blocks before ${block.index}`).toMatch(/^\n*$/)
    position = at + block.markdown.length
  }
  expect(whole.slice(position)).toMatch(/^\n*$/)
}

afterEach(() => vi.restoreAllMocks())

// ---------------------------------------------------------------------------
// kinds and Markdown
// ---------------------------------------------------------------------------

describe('describeBlocks: kinds and Markdown', () => {
  const mixed = () => parse([
    '# Title',
    '',
    'A paragraph.',
    '',
    '* one',
    '* two',
    '',
    '1. first',
    '2. second',
    '',
    '| A | B |',
    '| --- | --- |',
    '| 1 | 2 |',
    '',
    '```js',
    'let x = 1',
    '```',
    '',
    '> quoted',
    '',
    '---',
  ].join('\n'))

  test('each top-level block gets its index and a kind', () => {
    const { ok, blocks, count } = describeBlocks(mixed(), {})
    expect(ok).toBe(true)
    expect(count).toBe(8)
    expect(blocks.map(b => b.index)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
    expect(blocks.map(b => b.kind)).toEqual([
      'heading', 'paragraph', 'bullet-list', 'numbered-list', 'table', 'code', 'quote', 'other',
    ])
  })

  test('each block carries the Markdown the serializer writes for it', () => {
    const { blocks } = describeBlocks(mixed(), {})
    expect(blocks.map(b => b.markdown)).toEqual([
      '# Title',
      'A paragraph.',
      '* one\n\n* two',
      '1. first\n\n2. second',
      '| A | B |\n| --- | --- |\n| 1 | 2 |',
      '```js\nlet x = 1\n```',
      '> quoted',
      '---',
    ])
  })

  test('a paragraph that holds only an image is an image block', () => {
    const image = schema.nodes.image.create({ src: 'cat.png', alt: 'a cat' })
    const document = doc(schema.nodes.paragraph.create(null, [image]), p('text'))
    expect(describeBlocks(document, {}).blocks.map(b => b.kind)).toEqual(['image', 'paragraph'])
  })

  test('a paragraph with text and an image stays a paragraph', () => {
    const image = schema.nodes.image.create({ src: 'cat.png' })
    const document = doc(schema.nodes.paragraph.create(null, [schema.text('see '), image]))
    expect(describeBlocks(document, {}).blocks[0].kind).toBe('paragraph')
  })
})

describe('describeBlocks: blocks tile the document Markdown', () => {
  test('a mixed document', () => {
    expectBlocksTileTheDocument(parse('# T\n\npara\n\n* a\n* b\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n\n```\ncode\n```\n\nend'))
  })

  test('two lists of the same type in a row, which the serializer separates with extra blank lines', () => {
    const document = doc(
      schema.nodes.bullet_list.create(null, [schema.nodes.list_item.create(null, [p('a')])]),
      schema.nodes.bullet_list.create(null, [schema.nodes.list_item.create(null, [p('b')])]),
    )
    expectBlocksTileTheDocument(document)
    expect(describeBlocks(document, {}).blocks.map(b => b.markdown)).toEqual(['* a', '* b'])
  })

  test('a table as the last block, which ends in blank lines of its own', () => {
    expectBlocksTileTheDocument(parse('para\n\n| A | B |\n| --- | --- |\n| 1 | 2 |'))
  })
})

// ---------------------------------------------------------------------------
// the blocks that are special at the start of the document
// ---------------------------------------------------------------------------

describe('describeBlocks: metadata and HTML-preamble blocks', () => {
  test('a metadata block at index 0 has empty Markdown and counts in the indexes', () => {
    const document = doc(codeBlock('metadata', 'title: x'), p('body'))
    const { blocks, firstEditable } = describeBlocks(document, {})
    expect(blocks.map(b => [b.index, b.kind, b.markdown])).toEqual([[0, 'metadata', ''], [1, 'paragraph', 'body']])
    expect(firstEditable).toBe(1)
    expectBlocksTileTheDocument(document)
  })

  test('an HTML-preamble block at index 0 is raw HTML', () => {
    const document = doc(codeBlock('html', '<div>hi</div>'), p('body'))
    const { blocks, firstEditable } = describeBlocks(document, {})
    expect(blocks.map(b => [b.kind, b.markdown])).toEqual([['html-preamble', '<div>hi</div>'], ['paragraph', 'body']])
    expect(firstEditable).toBe(1)
    expectBlocksTileTheDocument(document)
  })

  test('a metadata block then an HTML preamble: both are special and firstEditable is 2', () => {
    const document = doc(codeBlock('metadata', 'a: 1'), codeBlock('html', '<p>x</p>'), p('body'))
    const { blocks, firstEditable } = describeBlocks(document, {})
    expect(blocks.map(b => b.kind)).toEqual(['metadata', 'html-preamble', 'paragraph'])
    expect(firstEditable).toBe(2)
  })

  test('with no special blocks firstEditable is 0', () => {
    expect(describeBlocks(doc(p('a'), p('b')), {}).firstEditable).toBe(0)
  })

  test('the same languages further into the document are ordinary code blocks', () => {
    const document = doc(p('first'), codeBlock('metadata', 'a: 1'), codeBlock('html', '<b>x</b>'))
    const { blocks, firstEditable } = describeBlocks(document, {})
    expect(blocks.map(b => b.kind)).toEqual(['paragraph', 'code', 'code'])
    expect(blocks[1].markdown).toBe('```metadata\na: 1\n```')
    expect(firstEditable).toBe(0)
  })

  test('an HTML block after a paragraph at index 1 is not a preamble', () => {
    const document = doc(p('first'), codeBlock('html', '<b>x</b>'))
    expect(describeBlocks(document, {}).blocks[1].kind).toBe('code')
  })
})

// ---------------------------------------------------------------------------
// hashes
// ---------------------------------------------------------------------------

describe('hashMarkdown', () => {
  test('is the same for the same Markdown and different for different Markdown', () => {
    expect(hashMarkdown('Hello')).toBe(hashMarkdown('Hello'))
    expect(hashMarkdown('Hello')).not.toBe(hashMarkdown('Hello!'))
    expect(hashMarkdown('')).not.toBe(hashMarkdown(' '))
  })

  test('is 14 lowercase hex characters', () => {
    for (const text of ['', 'a', '# Heading', 'multi\nline\n\ntext', '日本語 and emoji 🙂']) {
      expect(hashMarkdown(text)).toMatch(/^[0-9a-f]{14}$/)
    }
  })

  test('does not need a browser crypto API', () => {
    const saved = globalThis.crypto
    Object.defineProperty(globalThis, 'crypto', { value: undefined, configurable: true })
    try {
      expect(hashMarkdown('x')).toMatch(/^[0-9a-f]{14}$/)
    } finally {
      Object.defineProperty(globalThis, 'crypto', { value: saved, configurable: true })
    }
  })

  test('blocks with the same Markdown share a hash and each block carries the hash of its Markdown', () => {
    const { blocks } = describeBlocks(doc(p('same'), p('different'), p('same')), {})
    expect(blocks[0].hash).toBe(blocks[2].hash)
    expect(blocks[0].hash).not.toBe(blocks[1].hash)
    for (const block of blocks) expect(block.hash).toBe(hashMarkdown(block.markdown))
  })

  test('changing a block changes only its own hash', () => {
    const before = describeBlocks(doc(p('one'), p('two'), p('three')), {}).blocks.map(b => b.hash)
    const after = describeBlocks(doc(p('one'), p('TWO'), p('three')), {}).blocks.map(b => b.hash)
    expect(after[0]).toBe(before[0])
    expect(after[1]).not.toBe(before[1])
    expect(after[2]).toBe(before[2])
  })
})

// ---------------------------------------------------------------------------
// warnings
// ---------------------------------------------------------------------------

describe('describeBlocks: per-block warnings', () => {
  test('a warning raised while serializing a block is reported on that block only', () => {
    const underline = schema.marks.u.create()
    const document = doc(p('plain'), p('underlined', [underline]), schema.nodes.heading.create({ level: 2 }, [schema.text('h')]))
    const { blocks } = describeBlocks(document, {})
    expect(blocks[0].warnings).toEqual([])
    expect(blocks[1].warnings).toEqual(['Underline mark has no Markdown equivalent; rendering as plain text'])
    expect(blocks[2].warnings).toEqual([])
  })

  test('a block that raises several warnings reports each', () => {
    const marks = [schema.marks.u.create(), schema.marks.sub.create()]
    const { blocks } = describeBlocks(doc(p('both', marks)), {})
    expect(blocks[0].warnings.length).toBe(2)
  })

  test('the warnings a block reports match what exporting the whole document reports', () => {
    const underline = schema.marks.u.create()
    const document = doc(p('a', [underline]), p('b'), p('c', [underline]))
    const whole = makeWarnings()
    makeSerializer(whole).serialize(document, { escapeExtraCharacters: /</g })
    const reported = describeBlocks(document, {}).blocks.flatMap(b => b.warnings)
    expect(reported).toEqual(whole.get())
  })
})

// ---------------------------------------------------------------------------
// from, limit, next
// ---------------------------------------------------------------------------

describe('describeBlocks: from, limit and next', () => {
  const four = () => doc(p('aaaa'), p('bbbb'), p('cccc'), p('dddd'))   // each block's Markdown is 4 characters

  test('with no limit every block from `from` is returned and there is no next', () => {
    const result = describeBlocks(four(), { from: 1 })
    expect(result.blocks.map(b => b.index)).toEqual([1, 2, 3])
    expect('next' in result).toBe(false)
    expect(result.count).toBe(4)
  })

  test('the reply holds whole blocks until the next would pass the limit, and next names that block', () => {
    const result = describeBlocks(four(), { limit: 9 })
    expect(result.blocks.map(b => b.index)).toEqual([0, 1])
    expect(result.next).toBe(2)
  })

  test('a limit exactly the size of the blocks returned still fits them', () => {
    const result = describeBlocks(four(), { limit: 8 })
    expect(result.blocks.map(b => b.index)).toEqual([0, 1])
    expect(result.next).toBe(2)
  })

  test('at least one block is always returned, even when it is over the limit', () => {
    const result = describeBlocks(four(), { limit: 1 })
    expect(result.blocks.map(b => b.index)).toEqual([0])
    expect(result.next).toBe(1)
  })

  test('following next pages through the document without gaps or repeats', () => {
    const seen = []
    let from = 0
    for (let guard = 0; guard < 10; guard++) {
      const result = describeBlocks(four(), { from, limit: 5 })
      seen.push(...result.blocks.map(b => b.index))
      if (!('next' in result)) break
      from = result.next
    }
    expect(seen).toEqual([0, 1, 2, 3])
  })

  test('the last page has no next', () => {
    const result = describeBlocks(four(), { from: 3, limit: 100 })
    expect(result.blocks.map(b => b.index)).toEqual([3])
    expect('next' in result).toBe(false)
  })

  test('the limit counts Markdown characters, not the separators', () => {
    const result = describeBlocks(four(), { limit: 12 })
    expect(result.blocks.length).toBe(3)
  })

  test('firstEditable is reported whatever range is asked for', () => {
    const document = doc(codeBlock('metadata', 'a: 1'), p('x'), p('y'))
    expect(describeBlocks(document, { from: 2 }).firstEditable).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// arguments are validated, not clamped
// ---------------------------------------------------------------------------

describe('describeBlocks: argument validation', () => {
  const document = () => doc(p('a'), p('b'))

  test.each([
    ['a negative from', { from: -1 }],
    ['a from past the last block', { from: 2 }],
    ['a fractional from', { from: 0.5 }],
    ['a from that is not a number', { from: 'one' }],
    ['a zero limit', { limit: 0 }],
    ['a negative limit', { limit: -5 }],
    ['a fractional limit', { limit: 2.5 }],
    ['a limit that is not a number', { limit: '10' }],
  ])('%s is refused with a reason and returns no blocks', (_, args) => {
    const result = describeBlocks(document(), args)
    expect(result.ok).toBe(false)
    expect(typeof result.reason).toBe('string')
    expect(result.reason.length).toBeGreaterThan(0)
    expect(result.blocks).toBeUndefined()
  })

  test('null and undefined mean "not given"', () => {
    expect(describeBlocks(document(), { from: null, limit: null }).blocks.length).toBe(2)
    expect(describeBlocks(document(), {}).blocks.length).toBe(2)
  })

  test('from equal to the last index is accepted', () => {
    expect(describeBlocks(document(), { from: 1 }).blocks.map(b => b.index)).toEqual([1])
  })
})

// ---------------------------------------------------------------------------
// the MU-facing wrapper
// ---------------------------------------------------------------------------

describe('getBlocks (the MU function)', () => {
  test('with no active view it says so instead of throwing', () => {
    vi.spyOn(MU, 'activeView').mockReturnValue(undefined)
    const result = JSON.parse(getBlocks())
    expect(result).toEqual({ ok: false, reason: 'No active view' })
  })

  test('reads the active view and returns the same result as describeBlocks, as a JSON string', () => {
    const document = doc(p('one'), p('two'), p('three'))
    vi.spyOn(MU, 'activeView').mockReturnValue({ state: { doc: document } })
    const raw = getBlocks(1, 100)
    expect(typeof raw).toBe('string')
    expect(JSON.parse(raw)).toEqual(JSON.parse(JSON.stringify(describeBlocks(document, { from: 1, limit: 100 }))))
  })

  test('treats a missing from and limit as not given', () => {
    const document = doc(p('one'), p('two'))
    vi.spyOn(MU, 'activeView').mockReturnValue({ state: { doc: document } })
    expect(JSON.parse(getBlocks()).blocks.length).toBe(2)
  })

  test('a bad argument comes back as a refusal, never an exception', () => {
    vi.spyOn(MU, 'activeView').mockReturnValue({ state: { doc: doc(p('a')) } })
    const result = JSON.parse(getBlocks(5))
    expect(result.ok).toBe(false)
    expect(result.reason).toMatch(/from/)
  })
})

// ---------------------------------------------------------------------------
// reading part of a document gives what reading all of it gives
// ---------------------------------------------------------------------------

describe('describeBlocks: a range is the same as the matching part of the whole', () => {
  const documents = {
    plain: parse('# T\n\none\n\ntwo\n\nthree'),
    lists: parse('* a\n\n* b\n\n1. x\n\n2. y\n\n* c'),
    mixed: parse('# H\n\n| a | b |\n| --- | --- |\n| 1 | 2 |\n\n> q\n\n```js\nx\n```\n\n![i](a.png)\n\nend'),
    withMetadata: doc(codeBlock('metadata', 'title: x'), codeBlock('html', '<b>x</b>'), p('one'), p('two')),
    adjacentLists: doc(
      schema.nodes.bullet_list.create(null, [schema.nodes.list_item.create(null, p('a'))]),
      schema.nodes.bullet_list.create(null, [schema.nodes.list_item.create(null, p('b'))]),
      p('c')),
  }

  for (const [name, document] of Object.entries(documents)) {
    test(`${name}: every from/to window matches`, () => {
      const whole = describeBlocks(document, {})
      for (let from = 0; from < document.childCount; from++) {
        for (let to = from + 1; to <= document.childCount; to++) {
          const part = describeBlocks(document, { from, to })
          expect(part.blocks, `from ${from} to ${to}`).toEqual(whole.blocks.slice(from, to))
          expect(part.count).toBe(whole.count)
          expect(part.firstEditable).toBe(whole.firstEditable)
        }
      }
    })
  }

  test('a limit stops before the next block is returned and names it', () => {
    const part = describeBlocks(documents.plain, { from: 1, limit: 4 })
    expect(part.blocks.map(b => b.markdown)).toEqual(['one'])
    expect(part.next).toBe(2)
  })

  test('to must be an integer past from and within the document', () => {
    expect(describeBlocks(documents.plain, { from: 1, to: 1 }).ok).toBe(false)
    expect(describeBlocks(documents.plain, { to: 99 }).ok).toBe(false)
    expect(describeBlocks(documents.plain, { to: 1.5 }).ok).toBe(false)
  })

  test('blocks outside the range are not serialized', () => {
    const spy = vi.spyOn(documents.plain, 'child')
    describeBlocks(documents.plain, { from: 3, to: 4 })
    const touched = new Set(spy.mock.calls.map(c => c[0]))
    expect([...touched].every(i => i <= 1 || i === 3)).toBe(true)
  })
})
