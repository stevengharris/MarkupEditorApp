import { describe, test, expect } from 'vitest'
import { MU } from 'markupeditor'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'

const { schema } = MU

const produced = (md) => {
  const warnings = makeWarnings()
  const recorder = []
  const doc = makeParser(schema, warnings, recorder).parse(md)
  return { doc, recorder, warnings: warnings.get() }
}

describe('parser reports node-producing tokens', () => {
  test.each([
    ['paragraph', 'Hello world'],
    ['heading', '# Title'],
    ['bullet list', '- a\n- b'],
    ['ordered list', '1. a\n2. b'],
    ['blockquote', '> quoted'],
    ['table', '| a | b |\n| - | - |\n| 1 | 2 |'],
    ['fence', '```js\nlet x = 1\n```'],
    ['hr', '---'],
  ])('%s reports one level-0 token with a map', (_, md) => {
    const { doc, recorder } = produced(md)
    expect(recorder.length).toBe(1)
    expect(recorder[0].level).toBe(0)
    expect(recorder[0].map).toBeTruthy()
    expect(doc.childCount).toBe(1)
  })

  test('an html_block with <img src> reports a producing token', () => {
    const { doc, recorder, warnings } = produced('<img src="a.png" alt="a">')
    expect(recorder.length).toBe(1)
    expect(recorder[0].type).toBe('html_block')
    expect(doc.childCount).toBe(1)
    expect(warnings).toEqual([])
  })

  test('an html_block without an img src reports none and still warns', () => {
    const { doc, recorder, warnings } = produced('<div>x</div>\n\nafter')
    expect(recorder.map(t => t.type)).toEqual(['paragraph_open'])
    expect(doc.childCount).toBe(1)
    expect(warnings.some(w => w.startsWith('Raw HTML block stripped'))).toBe(true)
  })

  test('an html_block with <img> but no src reports none', () => {
    const { recorder } = produced('<img alt="a">\n\nafter')
    expect(recorder.map(t => t.type)).toEqual(['paragraph_open'])
  })

  test('nested tokens are never reported', () => {
    const { recorder } = produced('- a\n  - b\n- c\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n> - q')
    expect(recorder.length).toBe(3)
    expect(recorder.every(t => t.level === 0)).toBe(true)
    expect(recorder.map(t => t.type)).toEqual(['bullet_list_open', 'table_open', 'blockquote_open'])
  })

  test('a converted leading HTML run reports one token', () => {
    const { doc, recorder } = produced('```html\n<div>a</div>\n\n<div>b</div>\n```\n\ntext')
    expect(recorder.map(t => t.type)).toEqual(['fence', 'paragraph_open'])
    expect(doc.childCount).toBe(2)
  })

  test('tokens are in document order and match the top-level node count', () => {
    const md = '# T\n\n<div>gone</div>\n\ntext\n\n- a\n\n---\n\n<img src="a.png">\n\n```\ncode\n```'
    const { doc, recorder } = produced(md)
    expect(recorder.length).toBe(doc.childCount)
    const starts = recorder.map(t => t.map[0])
    expect([...starts].sort((a, b) => a - b)).toEqual(starts)
  })

  test('without a recorder the result is unchanged', () => {
    const md = '# T\n\n<div>gone</div>\n\ntext **b**\n\n| a | b |\n| - | - |\n| 1 | 2 |'
    const w1 = makeWarnings()
    const w2 = makeWarnings()
    const plain = makeParser(schema, w1).parse(md)
    const recorded = makeParser(schema, w2, []).parse(md)
    expect(recorded.eq(plain)).toBe(true)
    expect(w2.get()).toEqual(w1.get())
  })
})
