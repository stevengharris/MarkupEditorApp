import { MU } from 'markupeditor'

/**
 * A transaction that turns the cells of the first row of the table containing
 * the selection into header cells, keeping their content and attributes, or
 * null when the selection is not in a table or that row is already a header.
 *
 * Markdown tables always have a header row, and the serializer treats row 1 as
 * the header, so a table inserted into a Markdown document starts out with one.
 *
 * @param {EditorState} state
 * @returns {Transaction|null}
 */
export function headerRowTransaction(state) {
  const { schema, selection } = state
  const { table, table_row, table_cell, table_header } = schema.nodes
  const $from = selection.$from
  let tableDepth = -1
  for (let d = $from.depth; d > 0; d--) {
    if ($from.node(d).type === table) {
      tableDepth = d
      break
    }
  }
  if (tableDepth < 0) return null

  const tableNode = $from.node(tableDepth)
  const firstRow = tableNode.firstChild
  if (!firstRow || firstRow.type !== table_row) return null

  const rowPos = $from.start(tableDepth)
  const tr = state.tr
  let changed = false
  firstRow.forEach((cell, offset) => {
    if (cell.type === table_cell) {
      // Position of the cell: the row's start plus the cell's offset within the row.
      tr.setNodeMarkup(rowPos + 1 + offset, table_header, cell.attrs)
      changed = true
    }
  })
  return changed ? tr : null
}

/**
 * Wraps the base `insertTable` so the table it inserts starts with a header row.
 * The base tables are generic and have no header unless one is added; Markdown
 * tables always do.
 *
 * @param {function(number, number): boolean} insertTable - the base MU.insertTable
 * @param {function(): EditorView|null} activeView
 * @returns {function(number, number): boolean}
 */
export function makeInsertTableWithHeader(insertTable, activeView) {
  return (rows, cols) => {
    const result = insertTable(rows, cols)
    if (result === false) return result
    const view = activeView()
    if (!view) return result
    const tr = headerRowTransaction(view.state)
    if (tr) view.dispatch(tr)
    return result
  }
}
