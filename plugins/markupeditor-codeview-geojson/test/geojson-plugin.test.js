import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Schema, EditorState, EditorView, MU, Selection } from 'markupeditor'
import { joinBackward } from 'prosemirror-commands'
import { GeoJSONView, isGeojsonLanguage } from '../src/geojsonview.js'
import { geojsonPlugin } from '../src/geojsonplugin.js'

// Integration coverage for the keyboard/clipboard plugin against the REAL
// wiring shape (GeoJSONView + geojsonPlugin.createPlugin()), mirroring
// mermaid-plugin.test.js. Doesn't exercise the top-level `install()` module-
// load wiring itself (keyed to MU.activeView(), an import-time side effect
// not practical to unit-test in isolation) -- hand-wires the same factory
// shape instead, matching geojsonview.test.js's own approach. No theme-
// change coverage here: unlike Mermaid, this plugin colors its map purely
// via an external stylesheet, so there's no baked-in theme to re-render on
// an OS color-scheme change.

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

const VALID_GEOJSON = '{"type":"Point","coordinates":[-104.9903,39.7392]}'
const OTHER_GEOJSON = '{"type":"Point","coordinates":[-73.9857,40.7484]}'

function settleAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

// render's real contract is (geojson, map) => void, side-effecting.
function fakeRender(html) {
  return vi.fn((geojson, map) => { map.painted = html })
}

// Inert fake, not real Leaflet: these tests cover keyboard/clipboard plugin
// behavior, not map lifecycle. A fake also avoids fakeRender's innerHTML
// write clobbering a real Leaflet map's own internal DOM.
function fakeMapFactory() {
  return vi.fn(() => ({ invalidateSize: vi.fn(), remove: vi.fn() }))
}

function mountView(doc, { render, parse, mapFactory = fakeMapFactory() } = {}) {
  const nodeViews = {
    code_block: (node, view, getPos) => {
      if (isGeojsonLanguage(node.attrs.language)) return new GeoJSONView(node, view, getPos, null, { render, parse, mapFactory })
      return new MU.CodeView(node, view, getPos, null)
    }
  }
  const plugin = geojsonPlugin.createPlugin()
  const state = EditorState.create({ schema, doc, plugins: [plugin] })
  const container = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(container, { state, nodeViews })
  return {
    view,
    plugin,
    teardown: async () => {
      await settleAnimationFrame()
      view.destroy()
      container.remove()
    }
  }
}

function keyEvent(key) {
  return { key, shiftKey: false, metaKey: false, altKey: false, ctrlKey: false, preventDefault() {} }
}

function geojsonDoc(text = VALID_GEOJSON) {
  return schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('hello')),
    schema.node('code_block', { language: 'geojson' }, schema.text(text))
  ])
}

describe('arrow-key atomic hop around a Map-mode block', () => {
  it('ArrowRight from just before the block lands on its canonical position, ArrowRight again jumps past it', async () => {
    const doc = geojsonDoc()
    const render = fakeRender('<svg>ok</svg>')
    const { view, plugin, teardown } = mountView(doc, { render })
    expect(render).toHaveBeenCalledTimes(1)

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos - 1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    expect(view.state.selection.from).toBe(blockPos + 1)

    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    expect(view.state.selection.from).toBe(view.state.doc.content.size - 1)

    await teardown()
  })

  it('does not intercept arrow keys around a Source-mode block', async () => {
    const doc = geojsonDoc()
    const render = fakeRender('<svg>ok</svg>')
    const { view, plugin, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    const instance = view.nodeDOM(blockPos).codeView
    instance.setMode(true) // Source

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos))))
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(false)

    await teardown()
  })
})

describe('Delete/Backspace whole-block deletion around a Map-mode block', () => {
  it('Backspace immediately after the block deletes it atomically', async () => {
    const doc = geojsonDoc()
    const render = fakeRender('<svg>ok</svg>')
    const { view, plugin, teardown } = mountView(doc, { render })

    const endPos = view.state.doc.content.size
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(endPos))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
    expect(view.state.doc.childCount).toBe(1)

    await teardown()
  })

  it('Backspace inside the block\'s own (collapsed) content deletes it atomically', async () => {
    const doc = geojsonDoc()
    const render = fakeRender('<svg>ok</svg>')
    const { view, plugin, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
    expect(view.state.doc.childCount).toBe(1)

    await teardown()
  })
})

describe('deferring to normal join/delete-if-empty when the cursor is in a code_block, not atomically deleting the adjacent map', () => {
  it('Backspace at the start of a non-empty code_block after a Map-mode block defers, and the deferred join keeps the map block\'s own language', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'geojson' }, schema.text(VALID_GEOJSON)),
      schema.node('code_block', { language: null }, schema.text('Hello')),
    ])
    const render = fakeRender('<svg>ok</svg>')
    // The join below concatenates raw text ("...}Hello"), which is not valid
    // JSON -- fake parse so this test only exercises the join/defer behavior,
    // not real GeoJSON validation (matching mermaid-plugin.test.js's own
    // fake-render rationale for its analogous test).
    const parse = vi.fn().mockReturnValue({ type: 'Point', coordinates: [0, 0] })
    const { view, plugin, teardown } = mountView(doc, { render, parse })

    const secondBlockStart = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(secondBlockStart + 1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(false)
    expect(view.state.doc.childCount).toBe(2)

    expect(joinBackward(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.firstChild.attrs.language).toBe('geojson')
    expect(view.state.doc.firstChild.textContent).toBe(`${VALID_GEOJSON}Hello`)

    await teardown()
  })

  it('Backspace at the start of a PARAGRAPH (not a code_block) after a Map-mode block still deletes it atomically -- unchanged, regression guard', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'geojson' }, schema.text(VALID_GEOJSON)),
      schema.node('paragraph', null, schema.text('world')),
    ])
    const render = fakeRender('<svg>ok</svg>')
    const { view, plugin, teardown } = mountView(doc, { render })

    const secondBlockStart = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(secondBlockStart + 1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.firstChild.type.name).toBe('paragraph')

    await teardown()
  })
})

describe('copy/cut/paste of a selected Map-mode block', () => {
  function fakeClipboardEvent() {
    const data = new Map()
    return {
      clipboardData: {
        clearData: () => data.clear(),
        setData: (type, value) => data.set(type, value),
        getData: (type) => data.get(type) ?? '',
        get: (type) => data.get(type)
      },
      preventDefault() {}
    }
  }

  it('copy writes the whole block to the clipboard and does not modify the document', async () => {
    const doc = geojsonDoc()
    const render = fakeRender('<svg>ok</svg>')
    const { view, plugin, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))
    const docBefore = view.state.doc

    const event = fakeClipboardEvent()
    plugin.props.handleDOMEvents.copy(view, event)
    expect(event.clipboardData.getData('text/plain')).toContain('"type":"Point"')
    expect(view.state.doc).toBe(docBefore)

    await teardown()
  })

  it('cut writes the block to the clipboard and removes it from the document', async () => {
    const doc = geojsonDoc()
    const render = fakeRender('<svg>ok</svg>')
    const { view, plugin, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))

    const event = fakeClipboardEvent()
    plugin.props.handleDOMEvents.cut(view, event)
    expect(event.clipboardData.getData('text/plain')).toContain('"type":"Point"')
    expect(view.state.doc.childCount).toBe(1)

    await teardown()
  })

  it('paste with the block selected replaces its whole content, not a splice at the cursor', async () => {
    const doc = geojsonDoc()
    const render = fakeRender('<svg>ok</svg>')
    const { view, plugin, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))

    const event = fakeClipboardEvent()
    event.clipboardData.setData('text/plain', OTHER_GEOJSON)
    plugin.props.handleDOMEvents.paste(view, event)

    expect(view.state.doc.child(1).textContent).toBe(OTHER_GEOJSON)

    await teardown()
  })
})

describe('caret-hide class', () => {
  it('applies to the editor root only while selection is inside a Map-mode block', async () => {
    const doc = geojsonDoc()
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))
    expect(view.dom.classList.contains('geojson-hide-caret')).toBe(true)

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0))))
    expect(view.dom.classList.contains('geojson-hide-caret')).toBe(false)

    await teardown()
  })
})

// Mirrors mermaid-plugin.test.js's own capture-wrap-delegate composability
// test -- the exact pattern nodeview-factory-delegation.test.js (mermaid
// plugin) already anticipates a geojson plugin exercising.
describe('a geojson block coexisting with a non-geojson one, via the real capture-and-wrap factory pattern', () => {
  it('routes each block to the right NodeView and arrow-key navigation crosses both correctly', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'geojson' }, schema.text(VALID_GEOJSON)),
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const render = fakeRender('<svg>ok</svg>')
    const mapFactory = fakeMapFactory()
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const wrappedFactory = (node, view, getPos) => {
      if (isGeojsonLanguage(node.attrs.language)) return new GeoJSONView(node, view, getPos, null, { render, mapFactory })
      return originalFactory(node, view, getPos)
    }
    const plugin = geojsonPlugin.createPlugin()
    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: wrappedFactory } })

    const geojsonPos = 0
    const jsPos = doc.child(0).nodeSize
    expect(view.nodeDOM(geojsonPos).codeView).toBeInstanceOf(GeoJSONView)
    expect(view.nodeDOM(jsPos).codeView).toBeInstanceOf(MU.CodeView)
    expect(view.nodeDOM(jsPos).codeView).not.toBeInstanceOf(GeoJSONView)

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0))))
    expect(view.state.selection.from).toBe(geojsonPos + 1)
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    const landedIn = view.state.selection.$from
    expect(landedIn.parent.type.name).toBe('code_block')
    expect(landedIn.parent.attrs.language).toBe('javascript')
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(false)

    await settleAnimationFrame()
    view.destroy()
    container.remove()
  })
})

describe('makeCodeBlockFactory: language changed TO geojson via the Language dialog', () => {
  it('a plain code_block upgrades to GeoJSONView once its language becomes geojson', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    // Fake render + parse: the upgraded GeoJSONView immediately attempts a
    // render against 'const x = 1;' (not valid JSON) -- without stubbing
    // parse too, that hits the REAL parseGeojson + MU.reportError (which
    // dispatches a DOM event on an element that doesn't exist in this jsdom
    // test), unrelated to what this test actually checks. Mirrors
    // mermaid-plugin.test.js's own fake-render rationale for the same test.
    const render = fakeRender('<svg>ok</svg>')
    const parse = vi.fn().mockReturnValue({ type: 'Point', coordinates: [0, 0] })
    const codeBlockFactory = geojsonPlugin.makeCodeBlockFactory(originalFactory, null, { render, parse, mapFactory: fakeMapFactory() })
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: codeBlockFactory } })

    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(GeoJSONView)

    view.dispatch(view.state.tr.setNodeAttribute(0, 'language', 'geojson'))

    expect(view.nodeDOM(0).codeView).toBeInstanceOf(GeoJSONView)

    view.destroy()
    container.remove()
  })

  it('an ordinary content edit on a plain code_block still works normally after being wrapped', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const codeBlockFactory = geojsonPlugin.makeCodeBlockFactory(originalFactory, null)
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: codeBlockFactory } })

    view.dispatch(view.state.tr.insertText('!', 1))
    expect(view.state.doc.firstChild.textContent).toBe('!const x = 1;')
    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(GeoJSONView)

    view.destroy()
    container.remove()
  })
})

describe('wrapPasteCodeForMap: MU.pasteCode, the path native macOS paste actually uses', () => {
  let originalPasteCode
  beforeEach(() => { originalPasteCode = MU.pasteCode })
  afterEach(() => { MU.pasteCode = originalPasteCode })

  it('replaces the WHOLE content of a selected Map-mode block, not a splice at the cursor', async () => {
    const doc = geojsonDoc(VALID_GEOJSON)
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))
    geojsonPlugin.wrapPasteCodeForMap(view)

    MU.pasteCode(OTHER_GEOJSON)

    expect(view.state.doc.lastChild.textContent).toBe(OTHER_GEOJSON)

    await teardown()
  })

  it('delegates to the original MU.pasteCode for a plain (non-map-selected) code_block', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const { view, teardown } = mountView(doc, {})
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))
    const spy = vi.fn()
    MU.pasteCode = spy
    geojsonPlugin.wrapPasteCodeForMap(view)

    MU.pasteCode('!')

    expect(spy).toHaveBeenCalledWith('!')

    await teardown()
  })

  it('deletes the content entirely when pasted text is empty', async () => {
    const doc = geojsonDoc(VALID_GEOJSON)
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))
    geojsonPlugin.wrapPasteCodeForMap(view)

    MU.pasteCode('')

    expect(view.state.doc.lastChild.textContent).toBe('')

    await teardown()
  })
})
