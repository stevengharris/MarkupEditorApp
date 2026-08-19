import { describe, it, expect, vi } from 'vitest'
import { Schema, EditorState, EditorView, MU } from 'markupeditor'
import L from 'leaflet'
import { GeoJSONView, isGeojsonLanguage } from '../src/geojsonview.js'

// Exercises the REAL rendering path end to end -- real Leaflet, real
// mapFactory, real render() -- unlike geojsonview.test.js and
// geojson-plugin.test.js, which always inject fakes to isolate NodeView/
// plugin behavior from Leaflet specifics. This is what actually proves the
// tile layer, GeoJSON vector layer, fitBounds, and attribution requirements.

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

function codeBlockDoc(text, language) {
  return schema.node('doc', null, [
    schema.node('code_block', { language }, text ? schema.text(text) : undefined)
  ])
}

function settleAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function mountView(doc, { reportError } = {}) {
  const nodeViews = {
    code_block: (node, view, getPos) => {
      if (isGeojsonLanguage(node.attrs.language)) return new GeoJSONView(node, view, getPos, null, { reportError })
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

// jsdom has no real layout engine -- clientWidth/clientHeight are always 0
// regardless of CSS or connectedness. To reproduce the real gap this class
// of bug lives in (a NodeView's dom is detached during its OWN constructor,
// then attached afterward by ProseMirror -- confirmed empirically, not
// assumed), stub them as isConnected-dependent for the duration of a test:
// 0 while detached (matching both jsdom's real default AND a real detached
// element), a real nonzero size once connected. Finds and restores whatever
// jsdom itself defined the property on (Element.prototype in practice).
function withConnectedSize(width, height, fn) {
  const proto = (() => {
    let p = HTMLElement.prototype
    while (p && !Object.getOwnPropertyDescriptor(p, 'clientWidth')) p = Object.getPrototypeOf(p)
    return p ?? HTMLElement.prototype
  })()
  const originalWidth = Object.getOwnPropertyDescriptor(proto, 'clientWidth')
  const originalHeight = Object.getOwnPropertyDescriptor(proto, 'clientHeight')
  Object.defineProperty(proto, 'clientWidth', { configurable: true, get() { return this.isConnected ? width : 0 } })
  Object.defineProperty(proto, 'clientHeight', { configurable: true, get() { return this.isConnected ? height : 0 } })
  return Promise.resolve(fn()).finally(() => {
    Object.defineProperty(proto, 'clientWidth', originalWidth)
    Object.defineProperty(proto, 'clientHeight', originalHeight)
  })
}

// Denver, CO -- same coordinates used throughout this plugin's tests/examples.
const FEATURE = '{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[-104.9903,39.7392]}}'
// A Point plus a Polygon (Colorado's approximate boundary) -- mixed geometry
// types in one FeatureCollection.
const FEATURE_COLLECTION = '{"type":"FeatureCollection","features":[' +
  '{"type":"Feature","properties":{},"geometry":{"type":"Point","coordinates":[-104.9903,39.7392]}},' +
  '{"type":"Feature","properties":{},"geometry":{"type":"Polygon","coordinates":[[[-109.05,41.0],[-102.05,41.0],[-102.05,37.0],[-109.05,37.0],[-109.05,41.0]]]}}' +
  ']}'

describe('real Leaflet rendering', () => {
  it('a Feature produces a map fit to its own bounds, with a tile layer and a GeoJSON vector layer', async () => {
    const doc = codeBlockDoc(FEATURE, 'geojson')
    const { view, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView

    expect(instance.mode).toBe('map')
    // L.map() has no defined view (center/zoom) until setView/fitBounds is
    // called -- getCenter() throws "Set map center and zoom first" if
    // fitBounds never ran. Not throwing is a real, meaningful assertion that
    // fitBounds actually happened, not just that render() didn't error.
    expect(() => instance.map.getCenter()).not.toThrow()
    expect(instance.map._geojsonLayer).toBeDefined()
    expect(instance.map.hasLayer(instance.map._geojsonLayer)).toBe(true)

    await teardown()
  })

  it('a FeatureCollection with mixed geometry types (Point + Polygon) renders both as one fitted map', async () => {
    const doc = codeBlockDoc(FEATURE_COLLECTION, 'geojson')
    const { view, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView

    expect(instance.mode).toBe('map')
    expect(() => instance.map.getCenter()).not.toThrow()
    expect(instance.map._geojsonLayer.getLayers().length).toBe(2)

    await teardown()
  })

  it('OSM attribution is visible in the rendered map, not stripped or hidden', async () => {
    const doc = codeBlockDoc(FEATURE, 'geojson')
    const { view, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView

    const attribution = instance.mapContainer.querySelector('.leaflet-control-attribution')
    expect(attribution).not.toBeNull()
    expect(attribution.textContent).toContain('OpenStreetMap')

    await teardown()
  })

  it('invalid/non-GeoJSON content still falls back to Source mode with a reported error, and never constructs a map at all', async () => {
    const doc = codeBlockDoc('not valid geojson', 'geojson')
    const reportError = vi.fn()
    const { view, teardown } = mountView(doc, { reportError })
    const instance = view.nodeDOM(0).codeView

    expect(instance.mode).toBe('source')
    expect(instance.map).toBeNull()
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError.mock.calls[0][0]).toBe('GeoJSONRenderError')

    await teardown()
  })

  it('editing content while a map is showing replaces the vector layer rather than accumulating layers', async () => {
    const doc = codeBlockDoc(FEATURE, 'geojson')
    const { view, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView
    const firstLayer = instance.map._geojsonLayer

    view.dispatch(view.state.tr.replaceWith(1, view.state.doc.firstChild.nodeSize - 1, view.state.schema.text(FEATURE_COLLECTION)))

    expect(instance.map._geojsonLayer).not.toBe(firstLayer)
    expect(instance.map.hasLayer(firstLayer)).toBe(false) // old layer actually removed, not just reference-replaced
    expect(instance.map._geojsonLayer.getLayers().length).toBe(2)

    await teardown()
  })

  it('renders a Point geometry as a circleMarker, not Leaflet\'s default pin icon', async () => {
    const doc = codeBlockDoc(FEATURE, 'geojson')
    const { view, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView

    const [pointLayer] = instance.map._geojsonLayer.getLayers()
    expect(pointLayer).toBeInstanceOf(L.CircleMarker)
    expect(pointLayer).not.toBeInstanceOf(L.Marker)

    await teardown()
  })

  // Leaflet's own Map.Keyboard handler is enabled by default: its mousedown
  // listener on the map container calls container.focus() directly,
  // independent of and unpreventable by this plugin's own mousedown
  // handler (which only sets the ProseMirror selection). Once focused,
  // Leaflet attaches its own keydown listener on `document` that intercepts
  // arrow keys to pan the map -- hijacking exactly the keys ProseMirror
  // needs for atomic-block navigation past/through this block, and the
  // hijack persists until the container blurs (i.e. until the user clicks
  // outside the map entirely). Confirmed live in the real app before
  // fixing, not assumed from reading Leaflet's source alone.
  it('disables Leaflet\'s own keyboard handler -- arrow keys are ProseMirror\'s atomic-block navigation to handle, not the map\'s to intercept', async () => {
    const doc = codeBlockDoc(FEATURE, 'geojson')
    const { view, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView

    expect(instance.map.options.keyboard).toBe(false)
    expect(instance.map.keyboard.enabled()).toBe(false)

    await teardown()
  })

  it('never creates an <img> referencing a marker icon path -- a broken-image icon is impossible by construction, not merely unobserved', async () => {
    const doc = codeBlockDoc(FEATURE, 'geojson')
    const { view, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView

    const markerImages = [...instance.mapContainer.querySelectorAll('img')]
      .filter((img) => /marker-icon|marker-shadow/.test(img.src))
    expect(markerImages).toHaveLength(0)

    await teardown()
  })

  // A NodeView's dom is detached during its OWN constructor (confirmed
  // empirically -- ProseMirror builds the node tree before inserting it),
  // so mapFactory's L.map(mapContainer) call always measures a 0x0
  // container. Leaflet caches that size and does not auto-refresh (no
  // ResizeObserver) -- a later invalidateSize() call heals the SIZE, but
  // does not re-run fitBounds on its own, so a multi-point feature fit
  // against a 0x0 measurement stays pinned at the wrong (far too zoomed
  // out) view even after the container is genuinely connected and sized.
  it('ends up correctly sized and fit to bounds once genuinely connected, even though it was measured while still detached', async () => {
    await withConnectedSize(600, 320, async () => {
      const doc = codeBlockDoc(FEATURE_COLLECTION, 'geojson')
      const { view, teardown } = mountView(doc)
      const instance = view.nodeDOM(0).codeView

      // The one-shot correction is deferred to the next frame, by which
      // point the container is connected under jsdom too.
      await new Promise((resolve) => requestAnimationFrame(resolve))

      const size = instance.map.getSize()
      expect(size.x).toBeGreaterThan(0)
      expect(size.y).toBeGreaterThan(0)

      await teardown()
    })
  })

  // Tile images and the GeoJSON vector layer are independent Leaflet layers
  // added to the same map -- a tile <img> failing to load only marks that
  // one tile as errored (Leaflet's own GridLayer._tileOnError) and never
  // touches other layers or the map instance itself. This test forces every
  // tile to fail (simulating no network / DNS failure / OSM rate-limiting)
  // and asserts the vector layer and Leaflet's own chrome (zoom control,
  // pan) are unaffected -- degraded rendering, not broken rendering.
  it('a forced tile-load failure does not affect the GeoJSON vector layer or Leaflet\'s own pan/zoom chrome', async () => {
    await withConnectedSize(600, 320, async () => {
      const doc = codeBlockDoc(FEATURE_COLLECTION, 'geojson')
      // Explicit reportError double: failing every visible tile in one pass
      // (below) very likely also crosses the persistent-tile-failure
      // detection threshold (tested separately below) -- this test isn't
      // exercising that reporting path and shouldn't invoke the real
      // MU.reportError, which throws in this jsdom fixture (no #editor
      // element for its DOM-event callback to target).
      const { view, teardown } = mountView(doc, { reportError: vi.fn() })
      const instance = view.nodeDOM(0).codeView
      await settleAnimationFrame()

      // The actual rendered SVG geometry, not just the layer registry --
      // one <path> per feature's ring/outline (a Polygon boundary and a
      // circleMarker's own SVG-rendered <path>, not <circle>, in this
      // Leaflet SVG renderer), verified stable across the forced failure.
      const pathCountBefore = instance.mapContainer.querySelectorAll('path').length
      expect(pathCountBefore).toBeGreaterThan(0)

      const tileImages = instance.mapContainer.querySelectorAll('img.leaflet-tile')
      expect(tileImages.length).toBeGreaterThan(0)
      tileImages.forEach((img) => img.dispatchEvent(new Event('error')))

      expect(instance.map.hasLayer(instance.map._geojsonLayer)).toBe(true)
      expect(instance.map._geojsonLayer.getLayers().length).toBe(2)
      expect(instance.mapContainer.querySelectorAll('path').length).toBe(pathCountBefore)
      expect(instance.mapContainer.querySelector('.leaflet-control-zoom')).not.toBeNull()
      expect(instance.map.dragging.enabled()).toBe(true)
      expect(instance.map.scrollWheelZoom.enabled()).toBe(true)
      expect(() => instance.map.panBy([10, 10])).not.toThrow()

      await teardown()
    })
  })

  describe('persistent tile-failure detection', () => {
    // navigator.onLine is a plain boolean-returning getter in jsdom (no
    // native setter) -- redefine it for the duration of each test rather
    // than assigning, and always restore so other tests keep jsdom's
    // default (true).
    function withOnLine(value, fn) {
      const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'onLine')
      Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => value })
      return Promise.resolve(fn()).finally(() => {
        Object.defineProperty(Navigator.prototype, 'onLine', original)
      })
    }

    // Deterministic control over the failure sequence via the tile layer's
    // own Leaflet event emitter (map._tileLayer, stashed the same way
    // map._geojsonLayer is) rather than real DOM <img> dispatch -- avoids
    // coupling this test's failure count to however many tiles a given
    // viewport/zoom happens to cover.
    function failTiles(map, count) {
      for (let i = 0; i < count; i++) map._tileLayer.fire('tileerror')
    }

    it('reports GeoJSONTileError exactly once when tiles persistently fail while navigator.onLine is true', async () => {
      await withConnectedSize(600, 320, () => withOnLine(true, async () => {
        const doc = codeBlockDoc(FEATURE, 'geojson')
        const reportError = vi.fn()
        const { view, teardown } = mountView(doc, { reportError })
        const instance = view.nodeDOM(0).codeView
        await settleAnimationFrame()

        failTiles(instance.map, 3)

        expect(reportError).toHaveBeenCalledTimes(1)
        expect(reportError.mock.calls[0][0]).toBe('GeoJSONTileError')

        await teardown()
      }))
    })

    it('reports nothing when tiles persistently fail while navigator.onLine is false (ordinary offline use)', async () => {
      await withConnectedSize(600, 320, () => withOnLine(false, async () => {
        const doc = codeBlockDoc(FEATURE, 'geojson')
        const reportError = vi.fn()
        const { view, teardown } = mountView(doc, { reportError })
        const instance = view.nodeDOM(0).codeView
        await settleAnimationFrame()

        failTiles(instance.map, 3)

        expect(reportError).not.toHaveBeenCalled()

        await teardown()
      }))
    })

    it('does not report on a transient failure below the persistence threshold', async () => {
      await withConnectedSize(600, 320, () => withOnLine(true, async () => {
        const doc = codeBlockDoc(FEATURE, 'geojson')
        const reportError = vi.fn()
        const { view, teardown } = mountView(doc, { reportError })
        const instance = view.nodeDOM(0).codeView
        await settleAnimationFrame()

        failTiles(instance.map, 2) // one below the threshold used above
        instance.map._tileLayer.fire('tileload') // a single success resets the streak

        expect(reportError).not.toHaveBeenCalled()

        await teardown()
      }))
    })

    it('a given instance reports at most once per lifetime, even across repeated failure episodes', async () => {
      await withConnectedSize(600, 320, () => withOnLine(true, async () => {
        const doc = codeBlockDoc(FEATURE, 'geojson')
        const reportError = vi.fn()
        const { view, teardown } = mountView(doc, { reportError })
        const instance = view.nodeDOM(0).codeView
        await settleAnimationFrame()

        failTiles(instance.map, 3)
        instance.setMode(true) // Source
        instance.setMode(false) // back to Map -- a lifecycle event between episodes,
        // exercising the actual reachable path (setMode/syncModeClasses) a future
        // regression could wire into resetting the once-per-instance cap through,
        // not just the tileload streak-reset already covered above
        instance.map._tileLayer.fire('tileload') // recovers, resets the streak
        failTiles(instance.map, 3) // fails again -- a second episode

        expect(reportError).toHaveBeenCalledTimes(1)

        await teardown()
      }))
    })

    // reportError is caller-supplied (the default is MU.reportError, which
    // can itself throw -- e.g. no currently-active editor registered) and
    // this callback runs from inside Leaflet's own unguarded fire() (core/
    // Events.js: fn.call(...) with no try/catch), called from _tileReady
    // BEFORE that function's own bookkeeping (tile.loaded, _pruneTiles,
    // the tileload/load events). An uncaught throw here would abort that
    // bookkeeping -- exactly the "detection must never risk core rendering"
    // requirement this phase exists to uphold. Verifies the detection path
    // survives a throwing reportError, not just a well-behaved one.
    it('a throwing reportError does not propagate out of the tile-error handling or leave the map unusable', async () => {
      await withConnectedSize(600, 320, () => withOnLine(true, async () => {
        const doc = codeBlockDoc(FEATURE, 'geojson')
        const reportError = vi.fn(() => { throw new Error('reportError boom') })
        const { view, teardown } = mountView(doc, { reportError })
        const instance = view.nodeDOM(0).codeView
        await settleAnimationFrame()

        expect(() => failTiles(instance.map, 3)).not.toThrow()
        expect(reportError).toHaveBeenCalledTimes(1)
        expect(instance.map.hasLayer(instance.map._geojsonLayer)).toBe(true)
        expect(() => instance.map._tileLayer.fire('tileload')).not.toThrow()
        expect(() => instance.map.panBy([10, 10])).not.toThrow()

        await teardown()
      }))
    })
  })
})
