import { describe, it, expect, vi } from 'vitest'
import { Schema, EditorState, EditorView, MU } from 'markupeditor'
import { GeoJSONView, isGeojsonLanguage } from '../src/geojsonview.js'

// GeoJSONView unit coverage in isolation, via a hand-wired nodeViews factory
// -- NOT through geojsonplugin.js's real entry-point wiring (view.setProps +
// the language-aware factory override), which geojson-plugin.test.js covers
// instead. Mirrors mermaidview.test.js's structure; render() here is
// synchronous (no promise), so there's no "Rendering..." pending state and
// no vi.waitFor needed around a render call the way Mermaid's async render
// requires.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*', group: 'block',
      toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }]
    },
    code_block: {
      content: 'text*', group: 'block', code: true,
      attrs: { language: { default: null } },
      toDOM: () => ['pre', ['code', 0]], parseDOM: [{ tag: 'pre' }]
    },
    text: {}
  }
})

const VALID_GEOJSON = '{"type":"Point","coordinates":[-104.9903,39.7392]}'

function codeBlockDoc(text, language) {
  return schema.node('doc', null, [
    schema.node('code_block', { language }, text ? schema.text(text) : undefined)
  ])
}

function settleAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

// render's real contract is (geojson, map) => void, side-effecting -- draws
// the GeoJSON vector layer into the already-constructed map. Fakes it here
// by stamping a marker property on the (fake) map object, the same shape
// assertions further down check.
function fakeRender(html) {
  return vi.fn((geojson, map) => { map.painted = html })
}

// mapFactory's real contract is (container, onPersistentTileFailure) =>
// L.map(container); the second argument is real-Leaflet-tile-layer-specific
// and irrelevant to the lifecycle behavior faked here, so it's simply never
// invoked. Faked here as a spy returning a fresh fake map object per call
// (invalidateSize/remove as their own spies), so lifecycle tests can verify
// construction/resize/teardown call counts without a real Leaflet instance
// or DOM measurement.
function fakeMapFactory() {
  return vi.fn(() => ({ invalidateSize: vi.fn(), remove: vi.fn() }))
}

// Default to an inert fake map, not real Leaflet: most tests here care about
// tab/render/selection behavior, not map lifecycle (that's the dedicated
// "map instance lifecycle" describe block below, which always injects its
// own fakeMapFactory() explicitly). A fake also avoids a real correctness
// hazard -- a fakeRender that paints raw HTML into mapContainer (used
// throughout this file) would otherwise clobber a REAL Leaflet map's own
// internal DOM (panes etc.), leaving this.map holding dangling references.
function mountView(doc, { render, parse, reportError, mapFactory = fakeMapFactory() } = {}) {
  const nodeViews = {
    code_block: (node, view, getPos) => {
      if (isGeojsonLanguage(node.attrs.language)) {
        return new GeoJSONView(node, view, getPos, null, { render, parse, reportError, mapFactory })
      }
      return new MU.CodeView(node, view, getPos, null)
    }
  }
  const state = EditorState.create({ schema, doc })
  const container = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(container, { state, nodeViews })
  return {
    view,
    teardown: async () => {
      await settleAnimationFrame()
      view.destroy()
      container.remove()
    }
  }
}

describe('GeoJSONView defaults', () => {
  it('a non-empty, valid geojson block attempts Map by default and paints the rendered SVG synchronously', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })

    const instance = view.nodeDOM(0).codeView
    expect(instance).toBeInstanceOf(GeoJSONView)
    expect(instance.mode).toBe('map')
    expect(instance.mapContainer.className).toBe('geojson-map')
    expect(instance.map.painted).toBe('<svg>ok</svg>')
    expect(render).toHaveBeenCalledTimes(1)

    await teardown()
  })

  it('an empty geojson block stays on Source and never attempts a render', async () => {
    const doc = codeBlockDoc('', 'geojson')
    const render = vi.fn()
    const { view, teardown } = mountView(doc, { render })

    const instance = view.nodeDOM(0).codeView
    expect(instance.mode).toBe('source')
    expect(render).not.toHaveBeenCalled()
    expect(instance.mapContainer.isConnected).toBe(false)

    await teardown()
  })
})

describe('tab click / mode switching', () => {
  it('toggles mode synchronously and is a no-op on the already-active tab', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    instance.setActive(true)

    expect(instance.mode).toBe('map')
    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.mode).toBe('source')
    expect(instance.sourceTab.classList.contains('geojson-mode-toggle-active')).toBe(true)
    expect(instance.mapTab.classList.contains('geojson-mode-toggle-active')).toBe(false)

    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.mode).toBe('source')

    await teardown()
  })

  it('appends the map box on switch to Map and removes it on switch to Source', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    instance.setActive(true)

    expect(instance.mapContainer.classList.contains('geojson-map')).toBe(true)
    expect(instance.mapContainer.classList.contains('geojson-map-selected')).toBe(true)
    expect(instance.mapContainer.isConnected).toBe(true)
    expect(instance.contentDOM.classList.contains('geojson-hidden-code')).toBe(true)

    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.mapContainer.isConnected).toBe(false)
    expect(instance.contentDOM.classList.contains('geojson-hidden-code')).toBe(false)

    await teardown()
  })
})

describe('selection-gated tab/dom visibility', () => {
  it('Source/Map tabs are only DOM children of dom while active', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    expect(instance.sourceTab.isConnected).toBe(false)
    expect(instance.mapTab.isConnected).toBe(false)

    instance.setActive(true)
    expect(instance.sourceTab.isConnected).toBe(true)
    expect(instance.mapTab.isConnected).toBe(true)

    instance.setActive(false)
    expect(instance.sourceTab.isConnected).toBe(false)
    expect(instance.mapTab.isConnected).toBe(false)

    await teardown()
  })

  it('attaches below the block when there is no room above, matching the Language tab\'s own behavior', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    instance.dom.getBoundingClientRect = () => ({ top: 0, bottom: 20, left: 0, right: 0, width: 0, height: 20, x: 0, y: 0, toJSON() { return this } })
    instance.setActive(true)

    expect(instance.sourceTab.classList.contains('geojson-mode-toggle-below')).toBe(true)
    expect(instance.mapTab.classList.contains('geojson-mode-toggle-below')).toBe(true)

    await teardown()
  })
})

describe('render caching on edit', () => {
  it('editing while Map is showing re-renders with the fresh text', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>v1</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    expect(render).toHaveBeenCalledTimes(1)

    render.mockImplementation((geojson, map) => { map.painted = '<svg>v2</svg>' })
    view.dispatch(view.state.tr.insertText(' ', 1))

    expect(render).toHaveBeenCalledTimes(2)
    expect(instance.map.painted).toBe('<svg>v2</svg>')

    await teardown()
  })

  it('editing while Source is showing does not re-render', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    expect(render).toHaveBeenCalledTimes(1)
    instance.setMode(true) // Source
    expect(render).toHaveBeenCalledTimes(1)

    view.dispatch(view.state.tr.insertText(' ', 1))
    expect(instance.mode).toBe('source')
    expect(render).toHaveBeenCalledTimes(1) // still not re-triggered

    instance.setMode(false)
    expect(render).toHaveBeenCalledTimes(2)

    await teardown()
  })

  it('does not re-render unchanged content when switching modes back and forth', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })
    expect(render).toHaveBeenCalledTimes(1)
    const instance = view.nodeDOM(0).codeView

    instance.setMode(true)
    instance.setMode(false)
    expect(render).toHaveBeenCalledTimes(1) // cache still valid, no new attempt

    await teardown()
  })
})

describe('render error handling', () => {
  it('falls back to Source when parse throws, and reports the error exactly once', async () => {
    const doc = codeBlockDoc('not valid geojson', 'geojson')
    const parse = vi.fn(() => { throw new Error('Invalid JSON: Unexpected token') })
    const reportError = vi.fn()
    const { view, teardown } = mountView(doc, { parse, reportError })
    const instance = view.nodeDOM(0).codeView

    expect(instance.mode).toBe('source')
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith('GeoJSONRenderError', 'Invalid JSON: Unexpected token', 'not valid geojson', true)

    // Re-entering Map without an edit in between must bounce straight back
    // to Source and must not re-report the same cached failure.
    instance.setMode(false)
    expect(instance.mode).toBe('source')
    expect(instance.mapContainer.isConnected).toBe(false)
    expect(reportError).toHaveBeenCalledTimes(1)

    await teardown()
  })

  it('a render() that throws after successful parsing is handled the same way', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = vi.fn(() => { throw new Error('projection failure') })
    const reportError = vi.fn()
    const { view, teardown } = mountView(doc, { render, reportError })
    const instance = view.nodeDOM(0).codeView

    expect(instance.mode).toBe('source')
    expect(reportError).toHaveBeenCalledWith('GeoJSONRenderError', 'projection failure', VALID_GEOJSON, true)

    await teardown()
  })
})

// Real bug class caught in Mermaid/FrontMatter's own history: the Language
// dialog can change node.attrs.language on the SAME node identity without
// ProseMirror rebuilding the NodeView on its own.
describe('language changed away from geojson via the Language dialog', () => {
  it('the NodeView is rebuilt as a plain CodeView, with no Source/Map tabs and no map box left over', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })

    const blockPos = 0
    const before = view.nodeDOM(blockPos).codeView
    before.setActive(true)
    expect(before).toBeInstanceOf(GeoJSONView)

    view.dispatch(view.state.tr.setNodeAttribute(blockPos, 'language', null))

    const after = view.nodeDOM(blockPos).codeView
    expect(after).not.toBeInstanceOf(GeoJSONView)
    expect(after).toBeInstanceOf(MU.CodeView)
    expect(after.dom.querySelector('.geojson-mode-toggle')).toBeNull()
    expect(after.dom.querySelector('.geojson-map')).toBeNull()

    await teardown()
  })

  it('changing language to a different non-empty language also rebuilds away from GeoJSONView', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })

    view.dispatch(view.state.tr.setNodeAttribute(0, 'language', 'javascript'))

    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(GeoJSONView)

    await teardown()
  })
})

describe('selection border stays correct across a mode change without setActive being re-called', () => {
  it('pasting content into an empty, already-selected block then switching to Map shows the selected border', async () => {
    const doc = codeBlockDoc('', 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    instance.setActive(true) // selected while still empty/Source
    expect(instance.mapContainer.classList.contains('geojson-map-selected')).toBe(false)

    view.dispatch(view.state.tr.insertText(VALID_GEOJSON, 1))
    instance.setMode(false) // user clicks Map
    expect(render).toHaveBeenCalledTimes(1)

    expect(instance.mode).toBe('map')
    expect(instance.isActive).toBe(true)
    expect(instance.mapContainer.classList.contains('geojson-map-selected')).toBe(true)

    await teardown()
  })

  it('the border is removed on deselect and does not come back until reselected', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>ok</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    instance.setActive(true)
    expect(instance.mapContainer.classList.contains('geojson-map-selected')).toBe(true)

    instance.setActive(false)
    expect(instance.mapContainer.classList.contains('geojson-map-selected')).toBe(false)

    await teardown()
  })
})

describe('content replaced entirely while already in Map mode (e.g. paste over a selected map)', () => {
  it('the source text stays hidden after the content-replacing transaction, without any setMode call', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<svg>old</svg>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    expect(instance.contentDOM.classList.contains('geojson-hidden-code')).toBe(true)

    render.mockImplementation((geojson, map) => { map.painted = '<svg>new</svg>' })
    const newGeojson = '{"type":"Point","coordinates":[-73.9857,40.7484]}'
    view.dispatch(view.state.tr.replaceWith(1, view.state.doc.firstChild.nodeSize - 1, view.state.schema.text(newGeojson)))

    expect(instance.mode).toBe('map') // unchanged throughout
    expect(instance.contentDOM.classList.contains('geojson-hidden-code')).toBe(true)
    expect(instance.map.painted).toBe('<svg>new</svg>')

    await teardown()
  })
})

// GeoJSONView extends MU.CodeView and does not override ignoreMutation, so
// it inherits CodeView's own `mutation.type !== 'selection' &&
// !this.contentDOM.contains(mutation.target)` -- exempting mapContainer
// (a contentDOM sibling) from ProseMirror's default "unignored mutation
// outside contentDOM means discard and rebuild this NodeView" behavior.
// This matters here specifically because render() mutates mapContainer's
// own DOM directly (a real map's tile/pane churn will do the same, more
// continuously). Tested directly against the method (same technique as
// stopEvent below), not by trying to provoke an end-to-end reconstruction
// through ProseMirror's own deferred (native-MutationObserver-timed)
// dirty-tracking, which doesn't reproduce deterministically in jsdom.
describe('inherited ignoreMutation guard (MU.CodeView, not overridden here)', () => {
  it('does not define its own ignoreMutation -- the guard is genuinely inherited, not reimplemented', () => {
    expect(Object.getOwnPropertyNames(GeoJSONView.prototype)).not.toContain('ignoreMutation')
  })

  it('ignores a non-selection mutation targeting mapContainer, outside contentDOM', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<div>ok</div>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    expect(instance.ignoreMutation({ type: 'childList', target: instance.mapContainer })).toBe(true)
    expect(instance.ignoreMutation({ type: 'characterData', target: instance.mapContainer.firstChild })).toBe(true)

    await teardown()
  })

  it('does not ignore a non-selection mutation targeting contentDOM -- real content edits still get read', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<div>ok</div>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    expect(instance.ignoreMutation({ type: 'characterData', target: instance.contentDOM })).toBe(false)

    await teardown()
  })
})

describe('stopEvent', () => {
  it('returns true for events targeting inside mapContainer', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<div>ok</div>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    expect(instance.stopEvent({ target: instance.mapContainer })).toBe(true)
    const nestedChild = instance.mapContainer.appendChild(document.createElement('div'))
    expect(instance.stopEvent({ target: nestedChild })).toBe(true)

    await teardown()
  })

  it('returns false for events targeting outside mapContainer', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<div>ok</div>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    expect(instance.stopEvent({ target: instance.contentDOM })).toBe(false)
    expect(instance.stopEvent({ target: instance.sourceTab })).toBe(false)
    expect(instance.stopEvent({ target: document.body })).toBe(false)

    await teardown()
  })

  // stopEvent tells ProseMirror to ignore the event entirely (not a
  // selection/editing gesture); mapContainer's own mousedown listener
  // (constructor, above) is a SEPARATE, ordinary DOM listener that still
  // fires regardless -- the two were never verified to compose correctly
  // together until this test.
  it('a mousedown on mapContainer is not treated as a document edit, and the select-on-click handler still moves the selection into the block', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const render = fakeRender('<div>ok</div>')
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    const docBefore = view.state.doc

    instance.mapContainer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))

    expect(view.state.doc).toBe(docBefore) // no accidental document mutation
    expect(view.state.selection.from).toBeGreaterThan(0) // moved into the block's content

    await teardown()
  })
})

describe('map instance lifecycle', () => {
  it('constructs the map at most once, on first entry into Map mode, reused across every later toggle AND content change', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const mapFactory = fakeMapFactory()
    const { view, teardown } = mountView(doc, { render: fakeRender('<div>ok</div>'), mapFactory })
    const instance = view.nodeDOM(0).codeView
    const firstMap = instance.map
    expect(mapFactory).toHaveBeenCalledTimes(1)
    expect(firstMap).toBe(mapFactory.mock.results[0].value)

    instance.setMode(true)  // Source
    instance.setMode(false) // Map again
    instance.setMode(true)
    instance.setMode(false)

    expect(mapFactory).toHaveBeenCalledTimes(1) // still just the one, reused

    // Changing the block's own content while a map already exists must also
    // reuse it, not construct a second one -- this is the case that actually
    // exercises the construct-once guard (mode toggling alone never re-enters
    // ensureRendered's cache-miss branch at all, since unchanged text always
    // hits the cache-hit no-op path).
    view.dispatch(view.state.tr.insertText(' ', 1))

    expect(mapFactory).toHaveBeenCalledTimes(1)
    expect(instance.map).toBe(firstMap)

    await teardown()
  })

  it('calls invalidateSize on every re-entry into Map mode, but not on the initial construction entry', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const mapFactory = fakeMapFactory()
    const { view, teardown } = mountView(doc, { render: fakeRender('<div>ok</div>'), mapFactory })
    const instance = view.nodeDOM(0).codeView
    const fakeMap = instance.map
    expect(fakeMap.invalidateSize).not.toHaveBeenCalled() // construction entry: no resize needed yet

    instance.setMode(true)  // Source
    instance.setMode(false) // Map, 1st re-entry
    expect(fakeMap.invalidateSize).toHaveBeenCalledTimes(1)

    instance.setMode(true)
    instance.setMode(false) // Map, 2nd re-entry
    expect(fakeMap.invalidateSize).toHaveBeenCalledTimes(2)

    await teardown()
  })

  it('removes the map and clears the reference on destroy', async () => {
    const doc = codeBlockDoc(VALID_GEOJSON, 'geojson')
    const mapFactory = fakeMapFactory()
    const { view, teardown } = mountView(doc, { render: fakeRender('<div>ok</div>'), mapFactory })
    const instance = view.nodeDOM(0).codeView
    const fakeMap = instance.map

    instance.destroy()

    expect(fakeMap.remove).toHaveBeenCalledTimes(1)
    expect(instance.map).toBeNull()

    await teardown()
  })

  it('a block that never leaves Source (empty/invalid content) never constructs a map at all', async () => {
    const doc = codeBlockDoc('not valid geojson', 'geojson')
    const mapFactory = fakeMapFactory()
    const parse = vi.fn(() => { throw new Error('invalid') })
    const { view, teardown } = mountView(doc, { parse, mapFactory, reportError: vi.fn() })
    const instance = view.nodeDOM(0).codeView

    expect(instance.mode).toBe('source')
    expect(mapFactory).not.toHaveBeenCalled()
    expect(instance.map).toBeNull()

    await teardown()
  })
})
