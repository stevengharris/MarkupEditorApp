import { describe, test, expect, vi, afterEach } from 'vitest'
import { MU, EditorState } from 'markupeditor'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { findText, selectText } from '../src/select-text.js'

const { schema } = MU
const parse = (md) => makeParser(schema, makeWarnings()).parse(md)

afterEach(() => vi.restoreAllMocks())

const textOf = (doc, range) => doc.textBetween(range.from, range.to)

describe('findText', () => {
  const doc = parse('# The Cat\n\nthe cat sat on another cat\n\nno match here\n\n* a CAT in a list')

  test('finds occurrences in order from the document start, across blocks', () => {
    const found = [1, 2, 3, 4].map(n => findText(doc, 'cat', n))
    expect(found.every(Boolean)).toBe(true)
    expect(found.map(r => r.blockIndex)).toEqual([0, 1, 1, 3])
    expect(new Set(found.map(r => r.from)).size).toBe(4)
    expect(found.map(r => textOf(doc, r))).toEqual(['Cat', 'cat', 'cat', 'CAT'])
  })

  test('is case-insensitive', () => {
    expect(textOf(doc, findText(doc, 'CAT', 1))).toBe('Cat')
  })

  test('an occurrence past the last match is not found, and does not wrap', () => {
    expect(findText(doc, 'cat', 5)).toBeNull()
    expect(findText(doc, 'zzz', 1)).toBeNull()
  })

  test('matches the rendered text, not the Markdown', () => {
    const marked = parse('some **bold** and a [link](https://example.com) here')
    expect(textOf(marked, findText(marked, 'bold and a link', 1))).toBe('bold and a link')
    expect(findText(marked, '**bold**', 1)).toBeNull()
    expect(findText(marked, 'https://example.com', 1)).toBeNull()
  })

  test('a match inside a table cell and a code block is found', () => {
    const d = parse('| h |\n| --- |\n| needle |\n\n```\nsecond needle\n```')
    expect(findText(d, 'needle', 1).blockIndex).toBe(0)
    expect(findText(d, 'needle', 2).blockIndex).toBe(1)
  })

  test('positions stay right after an inline image', () => {
    const d = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [
      schema.text('ab'), schema.nodes.image.create({ src: 'a.png' }), schema.text('target'),
    ])])
    expect(textOf(d, findText(d, 'target', 1))).toBe('target')
  })

  test('occurrences in one block do not overlap', () => {
    const d = parse('aaaa')
    expect(findText(d, 'aa', 1).from).toBe(1)
    expect(findText(d, 'aa', 2).from).toBe(3)
    expect(findText(d, 'aa', 3)).toBeNull()
  })

  test('does not match across two blocks', () => {
    const d = parse('end of one\n\nstart of two')
    expect(findText(d, 'one start', 1)).toBeNull()
  })

  test('an empty needle is not found', () => {
    expect(findText(doc, '', 1)).toBeNull()
  })
})

describe('selectText (the MU function)', () => {
  function fakeView(document) {
    const view = { state: EditorState.create({ doc: document }), dispatch(tr) { view.state = view.state.apply(tr) } }
    return view
  }

  test('selects the match and reports it', () => {
    const document = parse('one cat\n\ntwo cat')
    const view = fakeView(document)
    vi.spyOn(MU, 'activeView').mockReturnValue(view)
    const result = JSON.parse(selectText('cat', 2))
    expect(result).toEqual({ found: true, blockIndex: 1 })
    const { from, to } = view.state.selection
    expect(document.textBetween(from, to)).toBe('cat')
    expect(from).toBeGreaterThan(8)
  })

  test('a miss reports found false and leaves the selection alone', () => {
    const document = parse('one cat')
    const view = fakeView(document)
    vi.spyOn(MU, 'activeView').mockReturnValue(view)
    const before = view.state.selection.toJSON()
    expect(JSON.parse(selectText('dog', 1))).toEqual({ found: false })
    expect(view.state.selection.toJSON()).toEqual(before)
  })

  test('with no active view it says so', () => {
    vi.spyOn(MU, 'activeView').mockReturnValue(undefined)
    expect(JSON.parse(selectText('a', 1))).toEqual({ found: false, reason: 'No active view' })
  })

  test('a bad occurrence is refused', () => {
    vi.spyOn(MU, 'activeView').mockReturnValue(fakeView(parse('a')))
    expect(JSON.parse(selectText('a', 0)).reason).toMatch(/occurrence/)
    expect(JSON.parse(selectText('a', 1.5)).reason).toMatch(/occurrence/)
    expect(JSON.parse(selectText('', 1)).reason).toMatch(/text/)
  })
})
