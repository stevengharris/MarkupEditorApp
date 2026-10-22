import { describe, test, expect } from 'vitest'
import { MU } from 'markupeditor'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { describeBlocks } from '../src/doc-blocks.js'

const { schema } = MU

// replaceBlocks imports the Markdown it is given with the parser alone, without the whole-document steps that
// strip front matter and fold leading HTML into a code block. These tests pin what that parser does with the
// fragments an assistant is likely to send, so a change in the parser shows up here.

function importFragment(markdown) {
  const warnings = makeWarnings()
  const doc = makeParser(schema, warnings).parse(markdown)
  const children = []
  doc.forEach(child => children.push(child))
  return { doc, children, kinds: children.map(c => c.type.name), warnings: warnings.get() }
}

const imageOf = (paragraph) => paragraph.firstChild

describe('a fragment is parsed as written, with no front-matter strip and no leading-HTML fold', () => {
  test('a leading HTML comment is dropped with a warning that names it, and the rest is kept', () => {
    const { kinds, children, warnings } = importFragment('<!-- note -->\n\nBody text')
    expect(kinds).toEqual(['paragraph'])
    expect(children[0].textContent).toBe('Body text')
    expect(warnings).toEqual(['Raw HTML block stripped (not supported in MarkupEditor): <!-- note -->'])
  })

  test('a leading <div> is dropped with a warning, and the rest is kept', () => {
    const { children, warnings } = importFragment('<div>hi</div>\n\nBody')
    expect(children.map(c => c.textContent)).toEqual(['Body'])
    expect(warnings.length).toBe(1)
    expect(warnings[0]).toMatch(/^Raw HTML block stripped/)
  })

  test('an HTML comment inside a paragraph is dropped with a warning', () => {
    const { children, warnings } = importFragment('text <!-- c --> more')
    expect(children[0].textContent).toBe('text  more')
    expect(warnings).toEqual(['Raw HTML inline stripped (not supported in MarkupEditor): <!-- c -->'])
  })

  test('a leading --- is a horizontal rule, not front matter', () => {
    const { kinds } = importFragment('---\n\nBody')
    expect(kinds).toEqual(['horizontal_rule', 'paragraph'])
  })

  test('front matter written into a fragment becomes a rule and a heading, with no warning', () => {
    const { kinds, children, warnings } = importFragment('---\ntitle: x\n---\n\nBody')
    expect(kinds).toEqual(['horizontal_rule', 'heading', 'paragraph'])
    expect(children[1].attrs.level).toBe(2)
    expect(children[1].textContent).toBe('title: x')
    expect(warnings).toEqual([])
  })

  test('a fenced block with language metadata or html is an ordinary code block here, so replaceBlocks must refuse it itself', () => {
    for (const language of ['metadata', 'html']) {
      const { children } = importFragment('```' + language + '\nx\n```')
      expect(children[0].type.name).toBe('code_block')
      expect(children[0].attrs.language).toBe(language)
    }
  })

  test('an empty fragment is one empty paragraph and does not throw', () => {
    for (const markdown of ['', '\n\n']) {
      const { kinds, children } = importFragment(markdown)
      expect(kinds).toEqual(['paragraph'])
      expect(children[0].childCount).toBe(0)
    }
  })
})

describe('every image syntax becomes an image node', () => {
  test.each([
    ['![alt text](pic.png)', 'pic.png', 'alt text'],
    ['![alt text][ref]\n\n[ref]: pic.png', 'pic.png', 'alt text'],
    ['<img src="pic.png" alt="alt text">', 'pic.png', 'alt text'],
    ['![r](https://example.com/p.png)', 'https://example.com/p.png', 'r'],
    ['<img src="https://example.com/p.png">', 'https://example.com/p.png', null],
  ])('%j', (markdown, src, alt) => {
    const { kinds, children, warnings } = importFragment(markdown)
    expect(kinds).toEqual(['paragraph'])
    expect(imageOf(children[0]).type.name).toBe('image')
    expect(imageOf(children[0]).attrs.src).toBe(src)
    expect(imageOf(children[0]).attrs.alt).toBe(alt)
    expect(warnings).toEqual([])
  })

  test('a raw <img> keeps its size', () => {
    const { children } = importFragment('<img src="a.png" alt="x" width="10" height="20">')
    expect(imageOf(children[0]).attrs.width).toBe(10)
    expect(imageOf(children[0]).attrs.height).toBe(20)
  })

  test('an inline <img> inside text becomes an inline image node', () => {
    const { children } = importFragment('see <img src="a.png" alt="x"> here')
    const names = []
    children[0].forEach(c => names.push(c.type.name))
    expect(names).toEqual(['text', 'image', 'text'])
  })

  test('an <img> written with single quotes is not recognized: it is dropped with a warning', () => {
    const { children, warnings } = importFragment("<img src='a.png' alt='x'>")
    expect(children[0].childCount).toBe(0)
    expect(warnings).toEqual(["Raw HTML block stripped (not supported in MarkupEditor): <img src='a.png' alt='x'>"])
  })
})

describe('the closure rule: Markdown that getBlocks emits is accepted back by the parser alone', () => {
  const underline = schema.marks.u.create()
  const documents = {
    'a document with every ordinary kind': () => makeParser(schema, makeWarnings()).parse([
      '# Title', '', 'A paragraph with *emphasis* and a [link](https://example.com).', '',
      '* one', '* two', '', '1. first', '2. second', '',
      '| A | B |', '| --- | --- |', '| 1 | 2 |', '',
      '```js', 'let x = 1', '```', '', '> quoted', '', '---',
    ].join('\n')),
    'an image paragraph, with and without a size': () => schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.nodes.image.create({ src: 'a.png', alt: 'plain' })]),
      schema.nodes.paragraph.create(null, [schema.nodes.image.create({ src: 'b.png', alt: 'sized', width: 30, height: 40 })]),
    ]),
    'text the serializer escapes': () => schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('a < b and *not emphasis* and [not a link]')]),
    ]),
    'a block that lost something on export': () => schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('underlined', [underline])]),
    ]),
  }

  for (const [name, make] of Object.entries(documents)) {
    test(name, () => {
      const { blocks } = describeBlocks(make(), {})
      for (const block of blocks) {
        const { kinds, warnings, doc } = importFragment(block.markdown)
        expect(kinds.length, `block ${block.index} (${block.kind}) came back as ${kinds}`).toBe(1)
        expect(warnings, `block ${block.index} (${block.kind})`).toEqual([])
        const again = describeBlocks(doc, {}).blocks[0]
        expect(again.kind).toBe(block.kind)
        expect(again.markdown).toBe(block.markdown)
      }
    })
  }
})
