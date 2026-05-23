import { describe, test, expect } from 'vitest'
import { schema } from 'markupeditor/src/schema/index.js'
import { makeSerializer } from '../src/serializer.js'
import { makeWarnings } from '../src/warnings.js'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function serialize(doc) {
  const warnings = makeWarnings()
  const serializer = makeSerializer(warnings)
  const md = serializer.serialize(doc)
  return { md, warnings: warnings.get() }
}

// ---------------------------------------------------------------------------
// Image size attributes
// ---------------------------------------------------------------------------

describe('image width warning', () => {
  test('image with width attr emits a warning; image is still in output', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: 'photo.jpg', alt: 'photo', width: 200, height: null })
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('width'))).toBe(true)
    expect(md).toMatch(/!\[photo\]\(photo\.jpg\)/)
  })
})

describe('image height warning', () => {
  test('image with height attr emits a warning; image is still in output', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: 'photo.jpg', alt: 'photo', width: null, height: 100 })
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('height'))).toBe(true)
    expect(md).toMatch(/!\[photo\]\(photo\.jpg\)/)
  })
})

describe('image width and height warning', () => {
  test('image with both width and height emits at least one warning; image is still in output', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: 'photo.jpg', alt: 'photo', width: 300, height: 200 })
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    // At least width and height each get their own warning, or one combined one
    const mentionsWidth = warnings.some(w => w.toLowerCase().includes('width'))
    const mentionsHeight = warnings.some(w => w.toLowerCase().includes('height'))
    expect(mentionsWidth || mentionsHeight).toBe(true)
    expect(md).toMatch(/!\[photo\]\(photo\.jpg\)/)
  })
})

// ---------------------------------------------------------------------------
// div node
// ---------------------------------------------------------------------------

describe('div warning', () => {
  test('div emits a warning; children text still appears in output', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.div.create(
        { id: 'div1', parentId: 'editor', cssClass: null },
        [schema.nodes.paragraph.create(null, [schema.text('div content')])]
      )
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('div'))).toBe(true)
    expect(md).toContain('div content')
  })
})

// ---------------------------------------------------------------------------
// button node
// ---------------------------------------------------------------------------

describe('button warning', () => {
  test('button emits a warning; content is dropped from output', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.button.create(
        { id: 'btn1', parentId: 'div1', cssClass: null, label: '' },
        [schema.text('Click me')]
      )
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('button'))).toBe(true)
    expect(md).not.toContain('Click me')
  })
})

// ---------------------------------------------------------------------------
// Unsupported marks: u, sub, sup
// ---------------------------------------------------------------------------

describe('u (underline) mark warning', () => {
  test('u mark emits a warning; plain text is preserved', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('underlined', [schema.marks.u.create()])
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('underline'))).toBe(true)
    expect(md).toContain('underlined')
  })
})

describe('sub mark warning', () => {
  test('sub mark emits a warning; plain text is preserved', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('H2O', [schema.marks.sub.create()])
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('subscript'))).toBe(true)
    expect(md).toContain('H2O')
  })
})

describe('sup mark warning', () => {
  test('sup mark emits a warning; plain text is preserved', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('E=mc2', [schema.marks.sup.create()])
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('superscript'))).toBe(true)
    expect(md).toContain('E=mc2')
  })
})

// ---------------------------------------------------------------------------
// Heading id attribute
// ---------------------------------------------------------------------------

describe('heading id attribute warning', () => {
  test('heading with id attr emits a warning; heading text is preserved', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.heading.create({ level: 2, id: 'my-section' }, [schema.text('Section Title')])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('id'))).toBe(true)
    expect(md).toContain('Section Title')
    expect(md).toMatch(/^##\s+Section Title/m)
  })
})

// ---------------------------------------------------------------------------
// Table class attribute
// ---------------------------------------------------------------------------

describe('table class attribute warning', () => {
  test('table with class attr emits a warning; table is still serialized', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.table.create({ class: 'bordered' }, [
        schema.nodes.table_row.create(null, [
          schema.nodes.table_cell.create(null, [
            schema.nodes.paragraph.create(null, [schema.text('Col A')])
          ]),
          schema.nodes.table_cell.create(null, [
            schema.nodes.paragraph.create(null, [schema.text('Col B')])
          ])
        ])
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('class'))).toBe(true)
    expect(md).toContain('Col A')
    expect(md).toContain('Col B')
  })
})
