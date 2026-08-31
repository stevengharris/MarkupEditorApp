import { describe, test, expect } from 'vitest'
import { MU } from 'markupeditor'
const { schema } = MU
import { makeSerializer } from '../src/serializer.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTable(attrs, rows) {
  return schema.nodes.table.create(attrs, rows)
}

function makeRow(cells) {
  return schema.nodes.table_row.create(null, cells)
}

function makeCell(text, align) {
  return schema.nodes.table_cell.create(align ? { align } : null, [
    schema.nodes.paragraph.create(null, [schema.text(text)])
  ])
}

function makeHeaderCell(text, align) {
  return schema.nodes.table_header.create(align ? { align } : null, [
    schema.nodes.paragraph.create(null, [schema.text(text)])
  ])
}

function serialize(doc) {
  const warnings = makeWarnings()
  const serializer = makeSerializer(warnings)
  const md = serializer.serialize(doc)
  return { md, warnings: warnings.get() }
}

function parse(md) {
  const warnings = makeWarnings()
  const parser = makeParser(schema, warnings)
  const doc = parser.parse(md)
  return { doc, warnings: warnings.get() }
}

// ---------------------------------------------------------------------------
// GFM pipe-table serialization
// ---------------------------------------------------------------------------

describe('table with a real header row (added via addHeader())', () => {
  test('emits correct pipe-table markdown with header and separator rows', () => {
    const doc = schema.nodes.doc.create(null, [
      makeTable(null, [
        makeRow([makeHeaderCell('Name'), makeHeaderCell('Age')]),
        makeRow([makeCell('Alice'), makeCell('30')]),
        makeRow([makeCell('Bob'), makeCell('25')])
      ])
    ])
    const { md, warnings } = serialize(doc)

    // No warnings expected for a plain table
    expect(warnings).toHaveLength(0)

    const lines = md.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0)

    // Header row
    expect(lines[0]).toBe('| Name | Age |')

    // Separator row — each cell should be ---
    expect(lines[1]).toMatch(/^\|(\s*---\s*\|)+$/)

    // Body rows
    expect(lines[2]).toBe('| Alice | 30 |')
    expect(lines[3]).toBe('| Bob | 25 |')
  })
})

describe('table with no real header (all rows are plain table_cell)', () => {
  test('row 1 still serializes as the header -- GFM pipe-table syntax has no way to represent a table with zero header rows', () => {
    const doc = schema.nodes.doc.create(null, [
      makeTable(null, [
        makeRow([makeCell('Alice'), makeCell('30')]),
        makeRow([makeCell('Bob'), makeCell('25')])
      ])
    ])
    const { md, warnings } = serialize(doc)

    expect(warnings).toHaveLength(0)

    const lines = md.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0)

    expect(lines[0]).toBe('| Alice | 30 |')
    expect(lines[1]).toMatch(/^\|(\s*---\s*\|)+$/)
    expect(lines[2]).toBe('| Bob | 25 |')
  })
})

describe('table round-trip', () => {
  test('a table with a real header: serialize → parse → re-serialize produces identical markdown', () => {
    const doc = schema.nodes.doc.create(null, [
      makeTable(null, [
        makeRow([makeHeaderCell('Col1'), makeHeaderCell('Col2')]),
        makeRow([makeCell('val1'), makeCell('val2')])
      ])
    ])
    const { md: md1 } = serialize(doc)

    const { doc: parsedDoc } = parse(md1)
    const { md: md2 } = serialize(parsedDoc)

    expect(md2.trim()).toBe(md1.trim())
  })

  test('a headerless table: serialize → parse → re-serialize produces identical markdown', () => {
    const doc = schema.nodes.doc.create(null, [
      makeTable(null, [
        makeRow([makeCell('Col1'), makeCell('Col2')]),
        makeRow([makeCell('val1'), makeCell('val2')])
      ])
    ])
    const { md: md1 } = serialize(doc)

    const { doc: parsedDoc } = parse(md1)
    const { md: md2 } = serialize(parsedDoc)

    expect(md2.trim()).toBe(md1.trim())
  })
})

describe('column alignment', () => {
  test('each column emits the GFM marker matching its align attr: left, center, right, unaligned', () => {
    const doc = schema.nodes.doc.create(null, [
      makeTable(null, [
        makeRow([
          makeHeaderCell('L', 'left'),
          makeHeaderCell('C', 'center'),
          makeHeaderCell('R', 'right'),
          makeHeaderCell('U')
        ]),
        makeRow([makeCell('1', 'left'), makeCell('2', 'center'), makeCell('3', 'right'), makeCell('4')])
      ])
    ])
    const { md, warnings } = serialize(doc)

    expect(warnings).toHaveLength(0)

    const lines = md.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0)
    expect(lines[0]).toBe('| L | C | R | U |')
    expect(lines[1]).toBe('| :--- | :---: | ---: | --- |')
    expect(lines[2]).toBe('| 1 | 2 | 3 | 4 |')
  })

  test('an unaligned column produces a plain --- marker, distinguishable from explicit left', () => {
    const doc = schema.nodes.doc.create(null, [
      makeTable(null, [
        makeRow([makeHeaderCell('A'), makeHeaderCell('B', 'left')]),
        makeRow([makeCell('1'), makeCell('2', 'left')])
      ])
    ])
    const { md } = serialize(doc)
    const lines = md.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0)
    expect(lines[1]).toBe('| --- | :--- |')
  })

  test('parsing a GFM table with alignment markers reproduces the matching align attr on every cell in the column', () => {
    const md = [
      '| L | C | R | U |',
      '| :--- | :---: | ---: | --- |',
      '| 1 | 2 | 3 | 4 |'
    ].join('\n')
    const { doc, warnings } = parse(md)

    expect(warnings).toHaveLength(0)

    const table = doc.firstChild
    const headerRow = table.child(0)
    const bodyRow = table.child(1)
    expect(headerRow.child(0).attrs.align).toBe('left')
    expect(headerRow.child(1).attrs.align).toBe('center')
    expect(headerRow.child(2).attrs.align).toBe('right')
    expect(headerRow.child(3).attrs.align).toBe(null)
    expect(bodyRow.child(0).attrs.align).toBe('left')
    expect(bodyRow.child(1).attrs.align).toBe('center')
    expect(bodyRow.child(2).attrs.align).toBe('right')
    expect(bodyRow.child(3).attrs.align).toBe(null)
  })

  test('a table with mixed column alignment: serialize → parse → re-serialize produces identical markdown', () => {
    const doc = schema.nodes.doc.create(null, [
      makeTable(null, [
        makeRow([makeHeaderCell('L', 'left'), makeHeaderCell('C', 'center'), makeHeaderCell('U')]),
        makeRow([makeCell('1', 'left'), makeCell('2', 'center'), makeCell('3')])
      ])
    ])
    const { md: md1 } = serialize(doc)
    const { doc: parsedDoc } = parse(md1)
    const { md: md2 } = serialize(parsedDoc)

    expect(md2.trim()).toBe(md1.trim())
  })
})

describe('table with class attribute', () => {
  test('class is dropped, warning is emitted, table content is still correct', () => {
    const doc = schema.nodes.doc.create(null, [
      makeTable({ class: 'bordered' }, [
        makeRow([makeHeaderCell('X'), makeHeaderCell('Y')]),
        makeRow([makeCell('1'), makeCell('2')])
      ])
    ])
    const { md, warnings } = serialize(doc)

    expect(warnings.length).toBeGreaterThan(0)
    expect(warnings.some(w => w.toLowerCase().includes('class'))).toBe(true)

    // Table content still present
    const lines = md.trim().split('\n').map(l => l.trim()).filter(l => l.length > 0)
    expect(lines[0]).toBe('| X | Y |')
    expect(lines[1]).toMatch(/^\|(\s*---\s*\|)+$/)
    expect(lines[2]).toBe('| 1 | 2 |')
  })
})
