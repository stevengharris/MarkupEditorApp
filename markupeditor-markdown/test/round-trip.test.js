import { describe, test, expect } from 'vitest'
import { schema } from 'markupeditor/src/schema/index.js'
import { makeSerializer } from '../src/serializer.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { DOMSerializer } from 'prosemirror-model'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serialize(doc) {
  const warnings = makeWarnings()
  const serializer = makeSerializer(warnings)
  return { md: serializer.serialize(doc), warnings }
}

function parse(md) {
  const warnings = makeWarnings()
  const parser = makeParser(schema, warnings)
  return { doc: parser.parse(md), warnings }
}

function docToHtml(doc) {
  const div = document.createElement('div')
  div.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content))
  return div.innerHTML
}

// ---------------------------------------------------------------------------
// Block nodes
// ---------------------------------------------------------------------------

describe('paragraph', () => {
  test('serializes to plain text line', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('Hello world')])
    ])
    const { md } = serialize(doc)
    expect(md.trim()).toBe('Hello world')
  })
})

describe('headings', () => {
  for (let level = 1; level <= 6; level++) {
    test(`h${level} → ${'#'.repeat(level)} text`, () => {
      const doc = schema.nodes.doc.create(null, [
        schema.nodes.heading.create({ level }, [schema.text('My Heading')])
      ])
      const { md } = serialize(doc)
      expect(md.trim()).toBe(`${'#'.repeat(level)} My Heading`)
    })
  }
})

describe('blockquote', () => {
  test('serializes to > text', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.blockquote.create(null, [
        schema.nodes.paragraph.create(null, [schema.text('quoted')])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/^>\s+quoted/m)
  })
})

describe('bullet_list', () => {
  test('serializes to - item', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, [
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, [schema.text('item one')])
        ])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/^[-*+]\s+item one/m)
  })
})

describe('ordered_list', () => {
  test('serializes to 1. item', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.ordered_list.create(null, [
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, [schema.text('first')])
        ])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/^1\.\s+first/m)
  })
})

describe('code_block', () => {
  test('serializes to fenced ```', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.code_block.create(null, [schema.text('const x = 1')])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/^```/m)
    expect(md).toContain('const x = 1')
    expect(md).toMatch(/```\s*$/m)
  })
})

describe('hard_break', () => {
  test('serializes with line break in markdown', () => {
    const hardBreak = schema.nodes.hard_break.create()
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('line one'),
        hardBreak,
        schema.text('line two')
      ])
    ])
    const { md } = serialize(doc)
    // prosemirror-markdown renders hard_break as \\\n or two-space newline
    expect(md).toMatch(/line one/)
    expect(md).toMatch(/line two/)
    // There should be a newline separating the two lines within the paragraph
    const lineOne = md.indexOf('line one')
    const lineTwo = md.indexOf('line two')
    expect(lineTwo).toBeGreaterThan(lineOne)
  })
})

describe('horizontal_rule', () => {
  test('serializes to ---', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('before')]),
      schema.nodes.horizontal_rule.create(),
      schema.nodes.paragraph.create(null, [schema.text('after')])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/^---$/m)
  })
})

// ---------------------------------------------------------------------------
// Inline marks
// ---------------------------------------------------------------------------

describe('strong mark', () => {
  test('serializes to **text**', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('bold', [schema.marks.strong.create()])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/\*\*bold\*\*/)
  })
})

describe('em mark', () => {
  test('serializes to _text_ or *text*', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('italic', [schema.marks.em.create()])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/[_*]italic[_*]/)
  })
})

describe('code inline mark', () => {
  test('serializes to `code`', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('inline', [schema.marks.code.create()])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/`inline`/)
  })
})

describe('s (strikethrough) mark', () => {
  test('serializes to ~~text~~', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('struck', [schema.marks.s.create()])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/~~struck~~/)
  })
})

describe('link mark', () => {
  test('serializes to [text](url)', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('click here', [schema.marks.link.create({ href: 'https://example.com', title: null })])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/\[click here\]\(https:\/\/example\.com\)/)
  })
})

describe('image node', () => {
  test('serializes without size to ![alt](src)', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: 'img.png', alt: 'a cat', width: null, height: null })
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(md).toMatch(/!\[a cat\]\(img\.png\)/)
    expect(warnings.get()).toHaveLength(0)
  })
})
