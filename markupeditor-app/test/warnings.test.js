import { describe, test, expect } from 'vitest'
import { MU } from 'markupeditor'
const { schema } = MU
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

describe('image with width — emits img tag', () => {
  test('image with width attr emits <img> tag with width; no warning', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: 'photo.jpg', alt: 'photo', width: 200, height: null })
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings).toHaveLength(0)
    expect(md).toContain('<img')
    expect(md).toContain('src="photo.jpg"')
    expect(md).toContain('width="200"')
    expect(md).not.toContain('height=')
  })
})

describe('image with height — emits img tag', () => {
  test('image with height attr emits <img> tag with height; no warning', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: 'photo.jpg', alt: 'photo', width: null, height: 100 })
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings).toHaveLength(0)
    expect(md).toContain('<img')
    expect(md).toContain('src="photo.jpg"')
    expect(md).toContain('height="100"')
    expect(md).not.toContain('width=')
  })
})

describe('image with width and height — emits img tag (AC-1)', () => {
  test('image with both width and height emits <img> tag with both; no warning', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: 'photo.jpg', alt: 'photo', width: 300, height: 200 })
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings).toHaveLength(0)
    expect(md).toContain('<img src="photo.jpg" alt="photo" width="300" height="200">')
  })
})

describe('image without dimensions — standard Markdown syntax (AC-2)', () => {
  test('image with no width or height emits ![alt](src); no warning', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.nodes.image.create({ src: 'photo.jpg', alt: 'photo', width: null, height: null })
      ])
    ])
    const { md, warnings } = serialize(doc)
    expect(warnings).toHaveLength(0)
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
