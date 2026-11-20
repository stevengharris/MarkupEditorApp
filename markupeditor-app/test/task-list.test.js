import { describe, test, expect, vi } from 'vitest'
import { MU, EditorState, EditorView, TextSelection } from 'markupeditor'
import { history, undo, redo, undoDepth } from 'prosemirror-history'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { makeSerializer } from '../src/serializer.js'
import { taskMarkerAt, taskListPlugin, toggleTask, taskListKey, setTaskListsEnabled } from '../src/task-list.js'

const { schema } = MU

const parse = md => makeParser(schema, makeWarnings()).parse(md)
const serialize = doc => makeSerializer(makeWarnings()).serialize(doc, { escapeExtraCharacters: /</g })

function viewFor(md) {
  const state = EditorState.create({ doc: parse(md), plugins: [history(), taskListPlugin()] })
  return new EditorView(document.createElement('div'), { state })
}

describe('serializer pass-through', () => {
  test.each([
    ['- [x] done\n- [ ] todo\n- plain', '* [x] done\n* [ ] todo\n* plain'],
    ['1. [x] first\n2. [ ] second', '1. [x] first\n2. [ ] second'],
    ['- [x] outer\n  - [ ] inner', '* [x] outer\n  * [ ] inner'],
    ['- [X] upper', '* [X] upper'],
  ])('%j round-trips unescaped', (md, expected) => {
    expect(serialize(parse(md)).trim()).toBe(expected)
  })

  test('formatting after the marker is kept', () => {
    expect(serialize(parse('- [x] some **bold** text')).trim()).toBe('* [x] some **bold** text')
  })

  test('brackets elsewhere are still escaped', () => {
    expect(serialize(parse('[x] plain paragraph')).trim()).toBe('\\[x\\] plain paragraph')
    expect(serialize(parse('- item [x] in the middle')).trim()).toBe('* item \\[x\\] in the middle')
    expect(serialize(parse('- second para\n\n  [x] not first')).trim()).toContain('\\[x\\] not first')
  })

  test('marker needs the trailing space and the leading position', () => {
    expect(serialize(parse('- [x]nospace')).trim()).toBe('* \\[x\\]nospace')
  })
})

describe('taskMarkerAt', () => {
  test('recognises checked, unchecked and uppercase', () => {
    const items = []
    parse('- [x] a\n- [ ] b\n- [X] c\n- d').descendants(n => { if (n.type.name === 'list_item') items.push(taskMarkerAt(n)) })
    expect(items).toEqual([{ checked: true, length: 4 }, { checked: false, length: 4 }, { checked: true, length: 4 }, null])
  })
})

function enterAgain(view) {
  return taskListKey.get(view.state).props.handleKeyDown(view, { key: 'Enter' })
}

describe('taskMarkerAt rejects items the file would not read as tasks', () => {
  const first = md => { let r; parse(md).descendants(n => { if (r === undefined && n.type.name === 'list_item') r = taskMarkerAt(n) }); return r }

  test('a marker with no text after it', () => {
    expect(first('- [ ] x')).not.toBeNull()
    const empty = schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text('[ ] ')))
    expect(taskMarkerAt(empty)).toBeNull()
    expect(taskMarkerAt(empty, { allowEmpty: true })).toEqual({ checked: false, length: 4 })
  })

  test('a marker carrying formatting', () => {
    expect(first('- **[x]** bold')).toBeNull()
  })
})

describe('task items in table cells', () => {
  test('are not drawn as checkboxes, since the file cannot hold them', () => {
    const cell = schema.nodes.table_cell.create(null, schema.nodes.bullet_list.create(null,
      schema.nodes.list_item.create(null, schema.nodes.paragraph.create(null, schema.text('[x] a')))))
    const row = schema.nodes.table_row.create(null, cell)
    const doc = schema.nodes.doc.create(null, schema.nodes.table.create(null, row))
    const state = EditorState.create({ doc, plugins: [taskListPlugin()] })
    const view = new EditorView(document.createElement('div'), { state })
    expect(view.dom.querySelectorAll('input.task-checkbox').length).toBe(0)
  })
})

describe('enabling per document type', () => {
  test('disabling removes the checkboxes and enabling restores them', () => {
    const view = viewFor('- [x] done')
    setTaskListsEnabled(view, false)
    expect(taskListKey.get(view.state)).toBeUndefined()
    expect(view.dom.querySelectorAll('input.task-checkbox').length).toBe(0)
    setTaskListsEnabled(view, true)
    setTaskListsEnabled(view, true)
    expect(view.state.plugins.filter(p => p.spec.key === taskListKey).length).toBe(1)
    expect(view.dom.querySelectorAll('input.task-checkbox').length).toBe(1)
  })

  test('MU.enableTaskLists(false) turns the plugin off on the active view', async () => {
    await import('../src/app.js')
    const view = viewFor('- [x] done')
    const active = vi.spyOn(MU, 'activeView').mockReturnValue(view)
    MU.enableTaskLists(false)
    expect(taskListKey.get(view.state)).toBeUndefined()
    active.mockRestore()
  })
})

describe('plugin', () => {
  test('draws a widget and hides the marker for each task item', () => {
    const view = viewFor('- [x] done\n- [ ] todo\n- plain')
    const boxes = view.dom.querySelectorAll('input.task-checkbox')
    expect([...boxes].map(b => b.checked)).toEqual([true, false])
    expect(view.dom.querySelectorAll('.task-marker').length).toBe(2)
  })

  test('toggle is one undo step and follows redo', () => {
    const view = viewFor('- [ ] todo')
    const from = 3
    expect(toggleTask(view, from)).toBe(true)
    expect(serialize(view.state.doc).trim()).toBe('* [x] todo')
    expect(undoDepth(view.state)).toBe(1)
    undo(view.state, view.dispatch)
    expect(serialize(view.state.doc).trim()).toBe('* [ ] todo')
    redo(view.state, view.dispatch)
    expect(serialize(view.state.doc).trim()).toBe('* [x] todo')
  })

  test('a caret never rests inside or before the marker; it moves to the start of the text', () => {
    const view = viewFor('- [ ] todo')
    const at = pos => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos)))
    at(3 + 2)
    expect(view.state.selection.head).toBe(7)
    at(3)
    expect(view.state.selection.head).toBe(7)
  })

  test('ArrowLeft at the start of the text goes to the end of the previous line', () => {
    const view = viewFor('- first\n- [ ] todo')
    let marker
    view.state.doc.descendants((n, pos) => { if (taskMarkerAt(n)) marker = pos + 2 })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, marker + 4)))
    const handled = taskListKey.get(view.state).props.handleKeyDown(view, { key: 'ArrowLeft' })
    expect(handled).toBe(true)
    expect(view.state.doc.textBetween(0, view.state.selection.head)).toBe('first')
  })

  test('ArrowLeft with shift extends the selection to the end of the previous line', () => {
    const view = viewFor('- first\n- [ ] todo')
    let marker
    view.state.doc.descendants((n, pos) => { if (taskMarkerAt(n)) marker = pos + 2 })
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, marker + 4)))
    taskListKey.get(view.state).props.handleKeyDown(view, { key: 'ArrowLeft', shiftKey: true })
    expect(view.state.selection.anchor).toBe(marker + 4)
    expect(view.state.doc.textBetween(0, view.state.selection.head)).toBe('first')
  })

  describe('Enter', () => {
    const enter = (md, offsetInText) => {
      const view = viewFor(md)
      let marker
      view.state.doc.descendants((n, pos) => { if (marker === undefined && taskMarkerAt(n, { allowEmpty: true })) marker = pos + 2 })
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, marker + 4 + offsetInText)))
      const handled = taskListKey.get(view.state).props.handleKeyDown(view, { key: 'Enter' })
      return { view, handled }
    }

    test('at the end of a task item starts a new unchecked task', () => {
      const { view, handled } = enter('- [x] done\n- other', 4)
      expect(handled).toBe(true)
      expect(serialize(view.state.doc).trim()).toBe('* [x] done\n* \n* other')
      expect(view.dom.querySelectorAll('input.task-checkbox').length).toBe(2)
    })

    test('in the middle of a task item moves the rest of the text to the new task', () => {
      const { view } = enter('- [ ] abcd', 2)
      expect(serialize(view.state.doc).trim()).toBe('* [ ] ab\n* [ ] cd')
    })

    test('is one undo step', () => {
      const { view } = enter('- [ ] abcd', 2)
      undo(view.state, view.dispatch)
      expect(serialize(view.state.doc).trim()).toBe('* [ ] abcd')
    })

    test('works in an ordered list', () => {
      const { view } = enter('1. [ ] one', 3)
      expect(view.state.doc.textContent).toBe('[ ] one[ ] ')
    })

    test('on an empty task removes the marker and leaves a plain empty item', () => {
      const { view } = enter('- [ ] a\n- b', 1)
      const second = enterAgain(view)
      expect(second).toBe(true)
      expect(view.state.doc.textContent).toBe('[ ] ab')
    })

    test('is left to the default outside a task item', () => {
      const view = viewFor('- plain')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)))
      expect(taskListKey.get(view.state).props.handleKeyDown(view, { key: 'Enter' })).toBe(false)
    })

    test('with shift is left to the default', () => {
      const view = viewFor('- [ ] abcd')
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 9)))
      expect(taskListKey.get(view.state).props.handleKeyDown(view, { key: 'Enter', shiftKey: true })).toBe(false)
    })
  })

  test('Backspace at the start of the text removes the whole marker', () => {
    const view = viewFor('- [ ] todo')
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)))
    const handled = taskListKey.get(view.state).props.handleKeyDown(view, { key: 'Backspace' })
    expect(handled).toBe(true)
    expect(view.state.doc.textContent).toBe('todo')
  })

  test('toggle does nothing off a marker', () => {
    const view = viewFor('- plain')
    expect(toggleTask(view, 3)).toBe(false)
  })
})

describe('app wiring', () => {
  test('enableTaskLists and importMarkdown install the plugin once, on the active view', async () => {
    await import('../src/app.js')
    const plain = () => new EditorView(document.createElement('div'), { state: EditorState.create({ doc: parse('- [x] a') }) })

    let view = plain()
    const active = vi.spyOn(MU, 'activeView').mockReturnValue(view)
    MU.enableTaskLists()
    MU.enableTaskLists()
    expect(view.state.plugins.filter(p => p.spec.key === taskListKey).length).toBe(1)
    expect(view.dom.querySelectorAll('input.task-checkbox').length).toBe(1)

    view = plain()
    active.mockReturnValue(view)
    MU.importMarkdown('- [x] a')
    expect(taskListKey.get(view.state)).toBeTruthy()

    active.mockReturnValue(null)
    expect(() => MU.enableTaskLists()).not.toThrow()
    active.mockRestore()
  })
})
