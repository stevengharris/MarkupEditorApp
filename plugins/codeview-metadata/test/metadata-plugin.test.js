import { describe, it, expect } from 'vitest'
import { Schema, EditorState, EditorView, MU, Selection, NodeSelection, TextSelection } from 'markupeditor'
import { MetadataView } from '../src/metadataview.js'
import { MetadataPlugin } from '../src/metadataplugin.js'
import { metadataPluginKey } from '../src/metadatapluginkey.js'

// Integration coverage for the real wiring shape (MetadataView +
// MetadataPlugin.createPlugin() + the code_block factory override),
// mirroring frontmatter-plugin.test.js. Doesn't exercise the top-level
// `metadataPlugin.install()` module-load wiring itself (keyed to
// MU.activeView(), an import-time side effect not practical to unit-test in
// isolation) -- hand-wires the same factory shape instead.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
    code_block: {
      content: 'text*', group: 'block', code: true,
      attrs: { language: { default: null } },
      toDOM: () => ['pre', ['code', 0]], parseDOM: [{ tag: 'pre' }]
    },
    text: {}
  }
})

function mountView(doc) {
  const plugin = new MetadataPlugin()
  const pmPlugin = plugin.createPlugin()
  const nodeViews = {
    code_block: plugin.makeCodeBlockFactory((node, view, getPos) => new MU.CodeView(node, view, getPos, null), null)
  }
  const state = EditorState.create({ schema, doc, plugins: [pmPlugin] })
  const container = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(container, { state, nodeViews })
  return {
    view,
    plugin,
    pmPlugin,
    teardown: () => {
      view.destroy()
      container.remove()
    }
  }
}

function keyEvent(key) {
  return { key, shiftKey: false, metaKey: false, altKey: false, ctrlKey: false, preventDefault() {} }
}

function metadataDoc(text = 'title: X') {
  return schema.node('doc', null, [
    schema.node('code_block', { language: 'metadata' }, schema.text(text)),
    schema.node('paragraph', null, schema.text('body'))
  ])
}

function plainDoc() {
  return schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('body')),
    schema.node('code_block', { language: 'swift' }, schema.text('let x = 1'))
  ])
}

describe('code_block factory', () => {
  it('constructs a MetadataView for a metadata-language block at position 0', () => {
    const { view, teardown } = mountView(metadataDoc())
    expect(view.nodeDOM(0).codeView).toBeInstanceOf(MetadataView)
    teardown()
  })

  it('constructs a plain CodeView for a metadata-language block NOT at position 0', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('body')),
      schema.node('code_block', { language: 'metadata' }, schema.text('title: X'))
    ])
    const { view, teardown } = mountView(doc)
    const pos = doc.child(0).nodeSize
    expect(view.nodeDOM(pos).codeView).not.toBeInstanceOf(MetadataView)
    teardown()
  })

  it('constructs a plain CodeView for a non-metadata language at position 0', () => {
    const doc = plainDoc()
    const { view, teardown } = mountView(doc)
    const swiftPos = doc.child(0).nodeSize // the paragraph is child 0; swift block follows it
    expect(view.nodeDOM(swiftPos).codeView).not.toBeInstanceOf(MetadataView)
    teardown()
  })
})

describe('wrapForMetadataUpgrade -- deliberate bootstrap creation', () => {
  it('converting an existing position-0 code_block\'s language to "metadata" rebuilds it as a MetadataView', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', null, schema.text('title: X')),
      schema.node('paragraph', null, schema.text('body'))
    ])
    const { view, teardown } = mountView(doc)
    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(MetadataView)

    const tr = view.state.tr.setNodeMarkup(0, undefined, { language: 'metadata' })
    view.dispatch(tr)

    expect(view.nodeDOM(0).codeView).toBeInstanceOf(MetadataView)
    teardown()
  })

  it('leaves a non-metadata language change on an ordinary block alone', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', null, schema.text('let x = 1')),
      schema.node('paragraph', null, schema.text('body'))
    ])
    const { view, teardown } = mountView(doc)
    const tr = view.state.tr.setNodeMarkup(0, undefined, { language: 'swift' })
    view.dispatch(tr)
    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(MetadataView)
    expect(view.state.doc.firstChild.attrs.language).toBe('swift')
    teardown()
  })
})

describe('appendTransaction active guard', () => {
  it('reverts a language change away from metadata at position 0 within the same resulting state', () => {
    const { view, teardown } = mountView(metadataDoc())
    const tr = view.state.tr.setNodeMarkup(0, undefined, { language: 'html' })
    view.dispatch(tr)
    expect(view.state.doc.firstChild.attrs.language).toBe('metadata')
    teardown()
  })

  it('reverts even a "Language: none" conversion (null language)', () => {
    const { view, teardown } = mountView(metadataDoc())
    const tr = view.state.tr.setNodeMarkup(0, undefined, { language: null })
    view.dispatch(tr)
    expect(view.state.doc.firstChild.attrs.language).toBe('metadata')
    teardown()
  })

  it('leaves a language change on a non-position-0 block alone', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'metadata' }, schema.text('title: X')),
      schema.node('code_block', { language: 'swift' }, schema.text('let x = 1'))
    ])
    const { view, teardown } = mountView(doc)
    const secondPos = doc.child(0).nodeSize
    const tr = view.state.tr.setNodeMarkup(secondPos, undefined, { language: 'python' })
    view.dispatch(tr)
    expect(view.state.doc.lastChild.attrs.language).toBe('python')
    teardown()
  })

  it('does not prevent deleting the metadata block entirely', () => {
    const { view, teardown } = mountView(metadataDoc())
    const size = view.state.doc.firstChild.nodeSize
    const tr = view.state.tr.delete(0, size)
    view.dispatch(tr)
    expect(view.state.doc.firstChild.type.name).toBe('paragraph')
    teardown()
  })

  it('a MetadataView instance never observes the reverted-away language in update() -- the guard composes before NodeViews see it', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    view.dispatch(view.state.tr.setNodeMarkup(0, undefined, { language: 'html' }))
    // Same instance survived (guard reverted within the same transaction, no factory reconsultation needed)
    expect(view.nodeDOM(0).codeView).toBe(instance)
    expect(instance.node.attrs.language).toBe('metadata')
    teardown()
  })
})

describe('checkAllPositions wiring through the real Plugin', () => {
  it('a metadata block pushed off position 0 by an inserted paragraph falls back to plain rendering', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    expect(instance).toBeInstanceOf(MetadataView)

    const paragraph = schema.node('paragraph', null, schema.text('inserted first'))
    view.dispatch(view.state.tr.insert(0, paragraph))

    expect(instance.positionValid).toBe(false)
    expect(instance.dom.contains(instance.bar)).toBe(false)
    teardown()
  })
})

describe('collapse-state Plugin, wired through the real Plugin key', () => {
  it('resets to expanded on a whole-document-load-shaped transaction (addToHistory: false)', () => {
    const { view, teardown } = mountView(metadataDoc())
    view.dispatch(view.state.tr.setMeta(metadataPluginKey, { collapsed: true }))
    expect(metadataPluginKey.getState(view.state).collapsed).toBe(true)

    const loadTr = view.state.tr.setMeta('addToHistory', false)
    view.dispatch(loadTr)
    expect(metadataPluginKey.getState(view.state).collapsed).toBe(false)
    teardown()
  })
})

// A Table-mode metadata block must behave as ONE atomic unit for keyboard
// navigation, like a Mermaid diagram -- otherwise the caret silently lands
// inside the visually-hidden contentDOM, and typing there mutates the real
// code_block content while Table is still showing (the "both Table and
// Source visible at once" bug this coverage guards against).
describe('arrow-key atomic hop around a Table-mode block', () => {
  it('ArrowRight from just before the block hops over it, landing in the following paragraph', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)

    const blockEnd = doc.child(0).nodeSize
    const landedPos = blockEnd + 1
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0), 1)))

    expect(pmPlugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    expect(view.state.selection.from).toBe(landedPos)
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph')

    teardown()
  })

  it('ArrowLeft from just after the block hops back to it, as a whole-node selection (not a text cursor inside it)', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    const blockEnd = doc.child(0).nodeSize

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockEnd + 1), 1)))
    expect(pmPlugin.props.handleKeyDown(view, keyEvent('ArrowLeft'))).toBe(true)
    // Landing creates a NodeSelection wrapping the whole block (selectable, not
    // editable -- see handleMetadataTextInput), not a TextSelection inside its
    // hidden content.
    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect(view.state.selection.from).toBe(0)
    expect(view.state.selection.node.attrs.language).toBe('metadata')

    teardown()
  })

  it('does not intercept arrow keys around a Source-mode block', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView
    instance.setMode(false) // Source

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0), 1)))
    expect(pmPlugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(false)

    teardown()
  })

  it('arrows away from an already-selected (NodeSelection) block to the following paragraph', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    const blockEnd = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))

    expect(pmPlugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    expect(view.state.selection.from).toBe(blockEnd + 1)
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph')

    teardown()
  })
})

describe('correctStraySelection -- catches routes other than ArrowLeft/Right', () => {
  it('a TextSelection that lands inside a Table-mode block (e.g. via default ArrowUp handling) is corrected to a NodeSelection', () => {
    const doc = metadataDoc()
    const { view, teardown } = mountView(doc)

    // Not going through handleKeyDown at all -- simulates whatever ProseMirror's own
    // default handling for a key/gesture this plugin doesn't explicitly intercept
    // (ArrowUp/Down, Home, a mouse click) would have produced: a plain TextSelection
    // landing inside the block's real (hidden) text content.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))

    expect(view.state.selection).toBeInstanceOf(NodeSelection)
    expect(view.state.selection.from).toBe(0)

    teardown()
  })

  it('does not touch a TextSelection inside a Source-mode block', () => {
    const doc = metadataDoc()
    const { view, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView
    instance.setMode(false) // Source

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)))

    expect(view.state.selection).toBeInstanceOf(TextSelection)
    expect(view.state.selection.from).toBe(1)

    teardown()
  })
})

describe('text input blocked while a Table-mode block is whole-node selected', () => {
  it('handleTextInput swallows typing while NodeSelection-selected on a Table-mode block', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))

    expect(pmPlugin.props.handleTextInput(view, 0, 0, 'x')).toBe(true)
    // The block is still there, untouched -- not replaced by the typed text.
    expect(view.state.doc.firstChild.attrs.language).toBe('metadata')
    expect(view.state.doc.firstChild.textContent).toBe('title: X')

    teardown()
  })

  it('does not block text input for an ordinary TextSelection elsewhere', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    const blockEnd = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, blockEnd + 1)))

    expect(pmPlugin.props.handleTextInput(view, blockEnd + 1, blockEnd + 1, 'x')).toBe(false)

    teardown()
  })
})

describe('Delete/Backspace whole-block deletion around a Table-mode block', () => {
  // Delete/Backspace pressed while positioned inside the block's text is not this
  // plugin's concern: correctStraySelection already converts that to a NodeSelection,
  // so handleMetadataDeleteKey defers to ProseMirror's default keymap, which deletes
  // a selected node natively.
  it('a NodeSelection parked on the block is not intercepted by this plugin -- deleteSelection removes it via ProseMirror default handling', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    const blockSize = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))

    expect(pmPlugin.props.handleKeyDown(view, keyEvent('Delete'))).toBe(false)
    view.dispatch(view.state.tr.deleteSelection())

    expect(view.state.doc.firstChild.type.name).toBe('paragraph')
    expect(view.state.doc.content.size).toBe(doc.content.size - blockSize)

    teardown()
  })

  it('never intercepts the Delete key -- "immediately before the block" is structurally impossible (always at position 0)', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))

    expect(pmPlugin.props.handleKeyDown(view, keyEvent('Delete'))).toBe(false)

    teardown()
  })

  it('Backspace immediately after the block deletes it atomically', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    const blockEnd = doc.child(0).nodeSize

    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, blockEnd + 1)))
    expect(pmPlugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
    expect(view.state.doc.firstChild.type.name).toBe('paragraph')

    teardown()
  })

  it('does not intercept Delete/Backspace around a Source-mode block', () => {
    const doc = metadataDoc()
    const { view, pmPlugin, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView
    instance.setMode(false) // Source

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0), 1)))
    expect(pmPlugin.props.handleKeyDown(view, keyEvent('Delete'))).toBe(false)

    teardown()
  })
})
