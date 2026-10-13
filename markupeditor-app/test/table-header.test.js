import { describe, test, expect, vi } from 'vitest'
import { MU, EditorState, TextSelection } from 'markupeditor'
import { headerRowTransaction, makeInsertTableWithHeader } from '../src/tables.js'

const { schema } = MU

function cell(type, text, attrs = null) {
  return schema.nodes[type].create(attrs, [schema.nodes.paragraph.create(null, text ? [schema.text(text)] : [])])
}

function row(...cells) {
  return schema.nodes.table_row.create(null, cells)
}

function docWithTable(...rows) {
  return schema.nodes.doc.create(null, [
    schema.nodes.paragraph.create(null, [schema.text('before')]),
    schema.nodes.table.create(null, rows),
  ])
}

/** A state whose selection is inside the first cell of the first table in `doc`. */
function stateInTable(doc) {
  let pos = null
  doc.descendants((node, p) => {
    if (pos === null && node.type === schema.nodes.table_cell || pos === null && node.type === schema.nodes.table_header) {
      pos = p + 2 // inside the cell's paragraph
    }
  })
  return EditorState.create({ doc, selection: TextSelection.create(doc, pos) })
}

function rowTypes(table, index) {
  const types = []
  table.child(index).forEach(c => types.push(c.type.name))
  return types
}

function firstTable(doc) {
  let table = null
  doc.descendants(node => { if (!table && node.type === schema.nodes.table) table = node })
  return table
}

describe('headerRowTransaction', () => {
  test('turns the cells of the first row into header cells and leaves the other rows alone', () => {
    const doc = docWithTable(
      row(cell('table_cell', 'a'), cell('table_cell', 'b')),
      row(cell('table_cell', 'c'), cell('table_cell', 'd')),
    )
    const tr = headerRowTransaction(stateInTable(doc))
    const table = firstTable(tr.doc)
    expect(rowTypes(table, 0)).toEqual(['table_header', 'table_header'])
    expect(rowTypes(table, 1)).toEqual(['table_cell', 'table_cell'])
  })

  test('keeps cell content and attributes', () => {
    const doc = docWithTable(
      row(cell('table_cell', 'a', { align: 'center' }), cell('table_cell', 'b')),
      row(cell('table_cell', 'c'), cell('table_cell', 'd')),
    )
    const table = firstTable(headerRowTransaction(stateInTable(doc)).doc)
    expect(table.child(0).child(0).textContent).toBe('a')
    expect(table.child(0).child(0).attrs.align).toBe('center')
    expect(table.child(0).child(1).textContent).toBe('b')
  })

  test('works on a table with a single row', () => {
    const doc = docWithTable(row(cell('table_cell', 'a'), cell('table_cell', 'b')))
    const table = firstTable(headerRowTransaction(stateInTable(doc)).doc)
    expect(rowTypes(table, 0)).toEqual(['table_header', 'table_header'])
  })

  test('returns null when the first row is already a header row', () => {
    const doc = docWithTable(
      row(cell('table_header', 'a'), cell('table_header', 'b')),
      row(cell('table_cell', 'c'), cell('table_cell', 'd')),
    )
    expect(headerRowTransaction(stateInTable(doc))).toBeNull()
  })

  test('returns null when the selection is not in a table', () => {
    const doc = docWithTable(row(cell('table_cell', 'a')))
    const state = EditorState.create({ doc, selection: TextSelection.create(doc, 2) })
    expect(headerRowTransaction(state)).toBeNull()
  })

  test('does not select anything new: the selection stays in the same cell', () => {
    const doc = docWithTable(
      row(cell('table_cell', 'a'), cell('table_cell', 'b')),
      row(cell('table_cell', 'c'), cell('table_cell', 'd')),
    )
    const state = stateInTable(doc)
    const tr = headerRowTransaction(state)
    expect(tr.selection.from).toBe(state.selection.from)
  })
})

describe('makeInsertTableWithHeader', () => {
  function fakeView(doc) {
    const view = { state: stateInTable(doc), dispatch: vi.fn() }
    view.dispatch.mockImplementation(tr => { view.state = view.state.apply(tr) })
    return view
  }

  test('inserts with the base function, then makes the first row a header', () => {
    const doc = docWithTable(
      row(cell('table_cell', ''), cell('table_cell', '')),
      row(cell('table_cell', ''), cell('table_cell', '')),
    )
    const view = fakeView(doc)
    const base = vi.fn(() => true)
    const insert = makeInsertTableWithHeader(base, () => view)

    expect(insert(2, 2)).toBe(true)

    expect(base).toHaveBeenCalledWith(2, 2)
    expect(view.dispatch).toHaveBeenCalledTimes(1)
    expect(rowTypes(firstTable(view.state.doc), 0)).toEqual(['table_header', 'table_header'])
  })

  test('does nothing more when the base insert did not insert a table', () => {
    const view = fakeView(docWithTable(row(cell('table_cell', 'a'))))
    const base = vi.fn(() => false)
    const insert = makeInsertTableWithHeader(base, () => view)

    expect(insert(2, 2)).toBe(false)

    expect(view.dispatch).not.toHaveBeenCalled()
  })

  test('does not throw when there is no active view', () => {
    const insert = makeInsertTableWithHeader(() => true, () => null)
    expect(() => insert(2, 2)).not.toThrow()
  })
})
