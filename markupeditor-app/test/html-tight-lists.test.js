import { beforeAll, beforeEach, describe, test, expect, vi } from 'vitest'
import { MU, DOMParser } from 'markupeditor'
import { importMarkdown } from '../src/markdown.js'
import { tightenHtml } from '../src/tight-lists.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
const { schema } = MU

let activeViewSpy
beforeAll(() => { activeViewSpy = vi.spyOn(MU, 'activeView') })
beforeEach(() => { activeViewSpy.mockReturnValue({ state: { schema } }) })

const html = (md) => tightenHtml(JSON.parse(importMarkdown(md)).result)

// The editor must read the HTML back as the same document the Markdown parses to.
function readBack(htmlString) {
  const div = document.createElement('div')
  div.innerHTML = htmlString
  return DOMParser.fromSchema(schema).parse(div)
}
const parsed = (md) => makeParser(schema, makeWarnings()).parse(md)

describe('tightened HTML import', () => {
  test('single-paragraph items have no <p>', () => {
    expect(html('- one\n- two\n')).toBe('<ul><li>one</li><li>two</li></ul>')
  })

  test('an ordered list is tight too', () => {
    expect(html('1. one\n2. two\n')).toBe('<ol><li>one</li><li>two</li></ol>')
  })

  test('a nested list keeps the parent item text unwrapped', () => {
    expect(html('- one\n  - inner\n- two\n'))
      .toBe('<ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul>')
  })

  test('only an item with more than one block keeps its paragraphs', () => {
    expect(html('- one\n\n  more\n- two\n'))
      .toBe('<ul><li><p>one</p><p>more</p></li><li>two</li></ul>')
  })

  test('inline formatting inside a tight item is kept', () => {
    expect(html('- a **b** [c](http://x.y)\n')).toBe('<ul><li>a <strong>b</strong> <a href="http://x.y">c</a></li></ul>')
  })

  test('a paragraph outside a list is untouched', () => {
    expect(html('para\n')).toBe('<p>para</p>')
  })

  test.each([
    '- one\n- two\n',
    '1. one\n2. two\n',
    '- one\n  - inner a\n    - deeper\n  - inner b\n- two\n',
    '- one\n\n  more\n- two\n',
    '- a **b** `c`\n- [d](http://x.y)\n',
    'Intro\n\n- a\n- b\n\ntext\n\n- c\n\n  d\n- e\n',
  ])('the editor reads the HTML back as the parsed document: %j', (md) => {
    expect(readBack(html(md)).eq(parsed(md))).toBe(true)
  })
})

describe('tightenHtml', () => {
  test('unwraps single-paragraph items and keeps multi-paragraph items', () => {
    expect(tightenHtml('<ul><li><p>one</p></li><li><p>a</p><p>b</p></li></ul>'))
      .toBe('<ul><li>one</li><li><p>a</p><p>b</p></li></ul>')
  })
  test('leaves paragraphs outside lists and other markup alone', () => {
    expect(tightenHtml('<h1>T</h1><p>x</p><!-- note --><ol><li><p>1</p></li></ol>'))
      .toBe('<h1>T</h1><p>x</p><!-- note --><ol><li>1</li></ol>')
  })
})
