import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest'
import { MU, EditorState, DOMParser } from 'markupeditor'
import { history } from 'prosemirror-history'
import { exportMarkdown, importMarkdown } from '../src/markdown.js'
import { rebaseSource } from '../src/source-map.js'
import { taskMarkerAt } from '../src/task-list.js'

const { schema } = MU

let current

// Load `text` the way the app does (import, then rebase) and return the tag rebaseSource reports.
function load(text) {
  current = EditorState.create({ schema })
  const div = document.createElement('div')
  div.innerHTML = JSON.parse(importMarkdown(text)).result
  current = EditorState.create({ doc: DOMParser.fromSchema(schema).parse(div), plugins: [history()] })
  return JSON.parse(rebaseSource(text)).tag
}

const save = tag => JSON.parse(exportMarkdown({ preserve: true, tag })).result

function editText(find, replacement) {
  let from = -1
  current.doc.descendants((node, pos) => {
    if (from < 0 && node.isText && node.text.includes(find)) from = pos + node.text.indexOf(find)
  })
  expect(from, `"${find}" not found`).toBeGreaterThanOrEqual(0)
  current = current.apply(current.tr.insertText(replacement, from, from + find.length))
}

// What toggleTask does to the document: replace the state character of the first marker.
function toggleFirstTask() {
  let from = -1
  current.doc.descendants((node, pos) => {
    if (from < 0 && taskMarkerAt(node)) from = pos + 2
  })
  const checked = taskMarkerAt(current.doc.nodeAt(from - 2)).checked
  current = current.apply(current.tr.insertText(checked ? ' ' : 'x', from + 1, from + 2))
}

beforeEach(() => {
  vi.spyOn(MU, 'activeView').mockImplementation(() => ({ state: current }))
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => vi.restoreAllMocks())

// Markers the serializer would not write itself, so a changed block shows plainly.
const SOURCE = '# Plan\n\n- [X] upper case\n+ [ ] plus marker\n\nA paragraph.\n\n* [x] star\n* [ ] second\n'

describe('preserved source with task lists', () => {
  test('a save with no edit returns the source byte for byte', () => {
    const tag = load(SOURCE)
    expect(save(tag)).toBe(SOURCE)
  })

  test('editing a paragraph leaves every task list as written', () => {
    const tag = load(SOURCE)
    editText('A paragraph', 'Changed paragraph')
    expect(save(tag)).toBe(SOURCE.replace('A paragraph', 'Changed paragraph'))
  })

  test('toggling a task rewrites only its own list, unescaped, and keeps the rest', () => {
    const tag = load(SOURCE)
    toggleFirstTask()
    const out = save(tag)
    expect(out).toContain('* [ ] upper case')
    expect(out).not.toContain('\\[')
    // The untouched blocks keep their original lines, markers included.
    expect(out.endsWith('A paragraph.\n\n* [x] star\n* [ ] second\n')).toBe(true)
    expect(out.startsWith('# Plan\n\n')).toBe(true)
  })

  test('typing a marker into a plain item saves as a task', () => {
    const tag = load('- plain item\n\nend\n')
    editText('plain item', '[x] plain item')
    expect(save(tag)).toBe('* [x] plain item\n\nend\n')
  })
})
