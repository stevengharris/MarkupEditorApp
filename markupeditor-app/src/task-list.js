import { Plugin, PluginKey, TextSelection, Decoration, DecorationSet } from 'markupeditor'

// A GFM task list marker: `[ ] `, `[x] ` or `[X] ` at the start of a list item's first paragraph.
const MARKER = /^\[([ xX])\] $/
const MARKER_LENGTH = 4

/**
 * The task marker of a list item, or null when the item is not a task item. A task item is a list item whose
 * first block is a paragraph that begins with the marker; the one definition shared by the plugin and the serializer.
 *
 * @param {object} listItem - a list_item node
 * @param {{allowEmpty?: boolean}} [options] - allowEmpty accepts a marker with nothing after it, which the editor shows
 *   as a task while its text is being typed but which the file does not hold as one
 * @returns {{checked: boolean, length: number} | null}
 */
export function taskMarkerAt(listItem, { allowEmpty = false } = {}) {
  const first = listItem?.firstChild
  if (listItem?.type.name !== 'list_item' || first?.type.name !== 'paragraph') return null
  // A marker with nothing after it is trimmed away when the file is read back, so it is not a task.
  if (first.content.size < MARKER_LENGTH || (!allowEmpty && first.content.size === MARKER_LENGTH)) return null
  const match = MARKER.exec(first.textBetween(0, MARKER_LENGTH, '\n', '￼'))
  if (!match) return null
  // Formatted marker characters are not the plain syntax the file would hold.
  let marked = false
  first.nodesBetween(0, MARKER_LENGTH, node => { if (node.marks.length) marked = true })
  return marked ? null : { checked: match[1] !== ' ', length: MARKER_LENGTH }
}

/** Every task item in `doc`, as {from, to, checked, item}: the range of its marker characters and of the list item. */
function taskMarkers(doc) {
  const markers = []
  doc.descendants((node, pos) => {
    // Markdown has no block content in a table cell, so a list there is flattened and never holds a task marker.
    if (node.type.name === 'table') return false
    const task = taskMarkerAt(node, { allowEmpty: true })
    // The list item opens at pos, its paragraph at pos + 1, and the paragraph's content at pos + 2.
    if (task) markers.push({ from: pos + 2, to: pos + 2 + task.length, checked: task.checked, item: { from: pos, to: pos + node.nodeSize } })
    return true
  })
  return markers
}

/**
 * Replace the state character of the marker that starts at `from`, as one transaction.
 *
 * @param {object} view - EditorView
 * @param {number} from - document position of the marker's opening bracket
 */
export function toggleTask(view, from) {
  const task = taskMarkers(view.state.doc).find(marker => marker.from === from)
  if (!task) return false
  view.dispatch(view.state.tr.insertText(task.checked ? ' ' : 'x', from + 1, from + 2))
  return true
}

function checkboxWidget(marker) {
  return view => {
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = 'task-checkbox'
    box.checked = marker.checked
    box.contentEditable = 'false'
    // The checkbox takes the place of the bullet, in the list's left gutter.
    box.style.cssText = 'margin: 0 0.4em 0 -1.5em; vertical-align: baseline'
    box.addEventListener('mousedown', event => {
      event.preventDefault()
      toggleTask(view, marker.from)
    })
    return box
  }
}

export const taskListKey = new PluginKey('taskList')

function decorate(doc) {
  const decorations = []
  for (const marker of taskMarkers(doc)) {
    decorations.push(Decoration.node(marker.item.from, marker.item.to, { class: 'task-item', style: 'list-style: none' }))
    // The checkbox follows the hidden marker so the caret, which sits at the marker's end, is drawn after it. A caret
    // at a position inside the hidden marker has no place to be drawn.
    decorations.push(Decoration.widget(marker.to, checkboxWidget(marker), { side: -1, key: `task-${marker.from}-${marker.checked}` }))
    decorations.push(Decoration.inline(marker.from, marker.to, { class: 'task-marker', style: 'display: none' }))
  }
  return DecorationSet.create(doc, decorations)
}

/** Keep an empty selection out of the hidden marker: a position before or inside it moves to the start of the text. */
function keepOutOfMarkers(transactions, oldState, newState) {
  const { selection } = newState
  if (!selection.empty) return null
  const head = selection.head
  const inside = taskMarkers(newState.doc).find(marker => head >= marker.from && head < marker.to)
  if (!inside) return null
  return newState.tr.setSelection(TextSelection.create(newState.doc, inside.to))
}

/**
 * Enter in the first paragraph of a task item starts a new unchecked task with the text after the caret. On a task with
 * no text it removes the marker, so the next Enter leaves the list as it does for any empty item.
 */
function splitTask(view) {
  const { state } = view
  const { $from } = state.selection
  if ($from.depth < 2 || $from.parent.type.name !== 'paragraph' || $from.node(-1).type.name !== 'list_item' || $from.index(-1) !== 0) return false
  const marker = taskMarkers(state.doc).find(m => m.item.from === $from.before(-1))
  if (!marker || $from.pos < marker.to) return false
  if (state.selection.empty && $from.parent.content.size === marker.to - marker.from) {
    view.dispatch(state.tr.delete(marker.from, marker.to))
    return true
  }
  const tr = state.tr.deleteSelection()
  const at = tr.selection.from
  // Splitting the paragraph and its list item adds two tokens per level, so the new paragraph's content starts at +4.
  tr.split(at, 2)
  tr.insertText('[ ] ', at + 4)
  tr.setSelection(TextSelection.create(tr.doc, at + 4 + MARKER_LENGTH))
  view.dispatch(tr.scrollIntoView())
  return true
}

/**
 * Backspace at the start of a task item's text removes the whole marker, not one hidden character. ArrowLeft there
 * goes to the end of the previous line, since the marker takes no visible space for a character step to cross.
 */
function handleKeyDown(view, event) {
  const plain = !event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && !event.isComposing
  if (event.key === 'Enter' && plain) return splitTask(view)
  const { selection } = view.state
  if (!selection.empty) return false
  const marker = taskMarkers(view.state.doc).find(m => m.to === selection.head)
  if (!marker) return false
  if (event.key === 'Backspace') {
    view.dispatch(view.state.tr.delete(marker.from, marker.to))
    return true
  }
  if (event.key === 'ArrowLeft' && !event.altKey && !event.metaKey && !event.ctrlKey) {
    const before = TextSelection.findFrom(view.state.doc.resolve(marker.item.from), -1)
    if (before) {
      const anchor = event.shiftKey ? selection.anchor : before.head
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, anchor, before.head)).scrollIntoView())
    }
    return true
  }
  return false
}

export function taskListPlugin() {
  return new Plugin({
    key: taskListKey,
    props: {
      decorations: state => decorate(state.doc),
      handleKeyDown,
    },
    appendTransaction: keepOutOfMarkers,
  })
}

/** Add the task list plugin to `view` if it does not have it. Safe to call repeatedly. */
export function ensureInstalled(view) {
  if (taskListKey.get(view.state)) return
  view.updateState(view.state.reconfigure({ plugins: [taskListPlugin(), ...view.state.plugins] }))
}

/** Show task lists in `view` when `enabled`, and remove them when not. */
export function setTaskListsEnabled(view, enabled) {
  if (enabled) return ensureInstalled(view)
  if (!taskListKey.get(view.state)) return
  view.updateState(view.state.reconfigure({ plugins: view.state.plugins.filter(p => p.spec.key !== taskListKey) }))
}
