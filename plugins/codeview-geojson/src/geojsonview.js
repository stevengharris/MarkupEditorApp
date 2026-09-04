import { MU, Selection } from 'markupeditor'
import L from 'leaflet'
import { parseGeojson, isGeojsonLanguage } from './geo.js'

export { isGeojsonLanguage }

const TAB_CLASS = 'geojson-mode-toggle'
const TAB_ACTIVE_CLASS = 'geojson-mode-toggle-active'
const TAB_BELOW_CLASS = 'geojson-mode-toggle-below'
const MAP_SELECTED_CLASS = 'geojson-map-selected'
const HIDDEN_CODE_CLASS = 'geojson-hidden-code'
const MAP_CLASS = 'geojson-map'

// OpenStreetMap tile usage policy (operations.osmfoundation.org/policies/
// tiles/) constraints that are code constraints, not just documentation:
// attribution must be present and visible (Leaflet's default attribution
// control does this automatically as long as it isn't disabled or hidden by
// CSS); tile caching stays at browser/Leaflet defaults (no cache-header
// override -- writing nothing here is deliberate); no prefetching (only
// tiles for the current viewport are ever requested, which is inherent to
// how L.tileLayer works, not something this code opts into or out of).
// Requests go out under WKWebView's unmodified default User-Agent -- a
// compliant identifying UA is unreachable from JS (img-tag tile requests
// carry the browser's own UA; User-Agent is a forbidden fetch/XHR header
// name) and is a knowingly accepted policy gap, not something to work
// around here.
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = '&copy; OpenStreetMap contributors'

// Consecutive tile-load failures required before treating this as a
// persistent problem worth surfacing, not a single transient blip (one bad
// tile request happens even on a healthy connection).
const TILE_ERROR_THRESHOLD = 3

// Draws (or redraws, replacing whatever it drew last time) the GeoJSON
// vector layer for the current content, fit to its own bounds. Tracks its
// own previous layer on the map object itself (map._geojsonLayer) so a
// content change while already in Map mode replaces rather than
// accumulates layers -- map is otherwise this function's only state, kept
// self-contained rather than reaching back into a GeoJSONView instance.
// The tile layer itself is NOT this function's concern: it doesn't change
// per edit, so it's part of constructing the map (defaultMapFactory below),
// not part of drawing into it.
function renderGeojson(geojson, map) {
    if (map._geojsonLayer) map.removeLayer(map._geojsonLayer)
    // Point geometries as circleMarker, not Leaflet's default L.marker pin
    // icon: L.Icon.Default resolves its marker PNGs by a page-relative path,
    // which breaks (silently under most bundlers, loudly as a blocked
    // file:// load under WKWebView) unless explicitly reconfigured with
    // bundled asset URLs -- circleMarker needs no image asset at all, so a
    // broken-image icon is impossible by construction, not merely avoided.
    map._geojsonLayer = L.geoJSON(geojson, {
        pointToLayer: (feature, latlng) => L.circleMarker(latlng)
    }).addTo(map)
    const bounds = map._geojsonLayer.getBounds()
    // An empty FeatureCollection, or a Feature with geometry: null, is valid
    // GeoJSON (RFC 7946 §3.2) but has nothing to fit a view to -- invalid
    // bounds here means zero renderable geometry, not a Leaflet-internal
    // edge case to shrug off. Left unhandled, the map never gets a view
    // (fitBounds is the only thing that sets one), so it never becomes
    // "loaded" and the tile layer's own onAdd -- deferred until then -- never
    // runs: a permanently blank map with no error reported. Throwing routes
    // this through ensureRendered's existing catch, which reports it and
    // falls back to Source, exactly like any other unrenderable content.
    if (!bounds.isValid()) throw new Error('GeoJSON contains no renderable geometry.')
    map.fitBounds(bounds)
}

// Constructs a fully-initialized Leaflet map instance -- the base tile layer
// is part of construction (added once, tied to the map's own lifecycle, not
// to content) not to render() above. Overridable in tests so lifecycle
// (construct-once, resize, teardown) is verifiable without a real Leaflet
// instance or real DOM measurement -- a test's fake mapFactory simply never
// reaches this real-Leaflet-API-dependent code at all.
//
// onPersistentTileFailure (optional) is invoked once each time consecutive
// tile failures cross TILE_ERROR_THRESHOLD -- a single successful tile
// resets the streak, so it can fire again for a later, separate episode.
// This function only detects the pattern; the report policy (navigator.
// onLine gate, once-per-instance cap) is the caller's concern, not the tile
// layer's -- kept out of here the same way render()'s content concerns are
// kept out of the map's own construction.
function defaultMapFactory(container, onPersistentTileFailure) {
    // keyboard: false -- Leaflet's own Map.Keyboard handler grabs real DOM
    // focus on the container via its own mousedown listener (independent of
    // and unpreventable by mapContainer's own mousedown handler above), then
    // intercepts arrow keys on `document` to pan the map. Arrow-key
    // navigation past/through this block is ProseMirror's atomic-block
    // concern here, not Leaflet's -- confirmed live in the real app, arrow
    // keys panned the map instead of moving the editor's selection once the
    // map had been clicked, and stayed hijacked until focus left the map
    // entirely.
    const map = L.map(container, { keyboard: false })
    const tiles = L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION }).addTo(map)
    map._tileLayer = tiles
    let consecutiveFailures = 0
    tiles.on('tileload', () => { consecutiveFailures = 0 })
    tiles.on('tileerror', () => {
        consecutiveFailures += 1
        if (consecutiveFailures === TILE_ERROR_THRESHOLD) {
            // Leaflet's own fire() (core/Events.js) calls listeners with no
            // try/catch, and GridLayer._tileReady fires 'tileerror' BEFORE
            // its own bookkeeping (tile.loaded, _pruneTiles, the tileload/
            // load events) -- an uncaught throw here (e.g. from a caller-
            // supplied reportError) would abort that bookkeeping. Detection
            // must never risk core rendering, so failures here are swallowed,
            // not surfaced.
            try {
                onPersistentTileFailure?.()
            } catch {
                // Intentionally swallowed -- see comment above.
            }
        }
    })
    return map
}

// Instances add themselves in the constructor, remove themselves in
// destroy() -- mirrors MermaidView/HTMLFrontMatterView's liveInstances.
const liveInstances = new Set()

/**
 * NodeView for a code_block whose language is geojson. Extends MU.CodeView:
 * inherits dom (<pre>), contentDOM (<code>), the Language tab, and the
 * this.dom.codeView = this backreference codeLanguageTabPlugin uses to find
 * and activate the current NodeView.
 *
 * Adds two more tabs (Source, Map) and a map-render box, all DOM siblings of
 * contentDOM inside dom -- the same shape as MermaidView's Source/Diagram
 * tabs. Mode ('source' | 'map') is plain instance state.
 *
 * Rendering here is synchronous -- no pending state, no render token, no
 * async staleness guard needed. Unlike HTMLFrontMatterView, invalid input is a
 * real, expected case (arbitrary code_block content, not already-sanitized
 * HTML) that must fall back to Source and report an error exactly once,
 * matching MermaidView's error handling.
 */
export class GeoJSONView extends MU.CodeView {
    constructor(node, view, getPos, languageDialog, { render = renderGeojson, parse = parseGeojson, reportError = MU.reportError, mapFactory = defaultMapFactory } = {}) {
        super(node, view, getPos, languageDialog)
        this.getPos = getPos
        this.render = render
        this.parse = parse
        this.reportError = reportError
        this.mapFactory = mapFactory
        this.node = node

        this.mode = 'source'
        this.isActive = false
        this.cached = null // null | {ok: true} | {error}
        this.lastRenderedText = null
        this.map = null // constructed at most once, lazily, on first entry into Map mode
        this.tileErrorReported = false // at most one GeoJSONTileError per instance lifetime

        this.mapContainer = document.createElement('div')
        this.mapContainer.className = MAP_CLASS
        this.mapContainer.contentEditable = 'false'
        // Clicking the map box moves the ProseMirror selection into the
        // block's (invisible-while-collapsed, but still real) content --
        // same pattern as MermaidView's diagram click handling.
        this.mapContainer.addEventListener('mousedown', (e) => {
            e.preventDefault()
            const pos = this.getPos()
            if (pos === undefined) return
            this.view.dispatch(this.view.state.tr.setSelection(Selection.near(this.view.state.doc.resolve(pos + 1))))
        })

        this.sourceTab = this.buildModeTab('Source', 'source', () => this.setMode(true))
        this.mapTab = this.buildModeTab('Map', 'map', () => this.setMode(false))

        liveInstances.add(this)
        // Defaults to attempting Map; setMode's empty-content guard (in
        // ensureRendered) falls back to Source for a block with no content
        // yet, or for content that fails to parse/validate as GeoJSON.
        this.setMode(false)
    }

    update(node) {
        const handled = super.update(node) // syncs language class + Language tab label
        if (!handled) return false
        // The Language dialog can change node.attrs.language on this SAME
        // node identity without ProseMirror rebuilding the NodeView --
        // returning false tells it to discard this instance and ask the
        // factory again, which (language no longer geojson) builds a plain
        // CodeView instead.
        if (!isGeojsonLanguage(node.attrs.language)) return false
        this.node = node
        const text = node.textContent
        if (text !== this.lastRenderedText) {
            this.cached = null
            this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, this.mode === 'map')
            if (this.mode === 'map') this.ensureRendered()
        }
        return true
    }

    setActive(isActive) {
        super.setActive(isActive) // Language tab, via MU.CodeView
        this.isActive = isActive
        if (isActive) {
            const shouldBeBelow = !this.hasRoomAbove()
            if (!this.dom.contains(this.sourceTab)) this.dom.appendChild(this.sourceTab)
            if (!this.dom.contains(this.mapTab)) this.dom.appendChild(this.mapTab)
            this.sourceTab.classList.toggle(TAB_BELOW_CLASS, shouldBeBelow)
            this.mapTab.classList.toggle(TAB_BELOW_CLASS, shouldBeBelow)
            this.positionTabs()
        } else {
            if (this.dom.contains(this.sourceTab)) this.dom.removeChild(this.sourceTab)
            if (this.dom.contains(this.mapTab)) this.dom.removeChild(this.mapTab)
        }
        this.syncSelectedClass()
    }

    // codeLanguageTabPlugin (markupeditor-base) only calls setActive when the
    // SELECTED instance itself changes -- matches MermaidView/HTMLFrontMatterView's
    // reasoning for why setMode must also re-sync the border, not just setActive.
    syncSelectedClass() {
        this.mapContainer.classList.toggle(MAP_SELECTED_CLASS, this.isActive && this.mode === 'map')
    }

    // Every event whose target lands inside mapContainer is ignored entirely
    // by ProseMirror, not interpreted as a selection/editing gesture -- lets
    // a live map's own drag-to-pan/wheel-to-zoom coexist with the
    // surrounding document's own selection and scroll handling. mousedown
    // specifically must stay included: blocking it wholesale elsewhere can
    // break the editor's own selection/drag machinery, but scoping the
    // predicate to mapContainer's own subtree avoids that.
    stopEvent(event) {
        return this.mapContainer.contains(event.target)
    }

    destroy() {
        liveInstances.delete(this)
        // Leaflet attaches real DOM listeners (mouse, wheel, touch) and holds
        // in-flight tile requests -- map.remove() is the documented required
        // teardown; omitting it leaks both for the life of the WKWebView, not
        // just until this block scrolls out of view.
        this.map?.remove()
        this.map = null
        super.destroy()
    }

    buildModeTab(label, tabType, onClick) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = TAB_CLASS
        button.dataset.tab = tabType
        button.contentEditable = 'false'
        button.textContent = label
        button.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation() // don't also trigger mapContainer's select-on-click handler
            onClick()
        })
        return button
    }

    // Explicit SET, not a toggle: clicking the already-active tab is a
    // harmless no-op rather than flipping away from it.
    setMode(isSource) {
        const nextMode = isSource ? 'source' : 'map'
        if (nextMode === this.mode) return
        this.mode = nextMode
        this.syncModeClasses()
        if (this.mode === 'map') this.ensureRendered()
    }

    // domObserver.stop()/start() bracketing: called from a tab click and from
    // ensureRendered, both outside a ProseMirror-initiated dispatch/update
    // cycle in the tab-click case -- same reasoning as MermaidView's
    // syncModeClasses, which this mirrors directly.
    syncModeClasses() {
        this.view.domObserver?.stop()
        try {
            const isSource = this.mode === 'source'
            this.sourceTab.classList.toggle(TAB_ACTIVE_CLASS, isSource)
            this.mapTab.classList.toggle(TAB_ACTIVE_CLASS, !isSource)
            this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, !isSource)
            if (isSource && this.dom.contains(this.mapContainer)) this.dom.removeChild(this.mapContainer)
            if (!isSource && !this.dom.contains(this.mapContainer)) {
                this.dom.appendChild(this.mapContainer)
                // L.map() measures its container's size at construction time;
                // this plugin's default state is Source (mapContainer hidden/
                // detached), so a map shown again after being hidden needs an
                // explicit resize on every re-entry into Map mode -- not only
                // once. No-op on the very first entry: this.map doesn't exist
                // yet at this point -- ensureRendered, called right after
                // this, constructs it (against a still-detached container,
                // per Finding 20) and applies its own one-shot correction
                // there instead.
                if (this.map) this.map.invalidateSize()
            }
        } finally {
            this.view.domObserver?.start()
        }
        this.syncSelectedClass()
    }

    // Deferred to a frame, matching MU.CodeView's Language-tab positioning.
    positionTabs() {
        requestAnimationFrame(() => {
            if (!this.dom.isConnected) return
            const gap = 4
            let right = gap
            if (this.tab && this.dom.contains(this.tab)) right = this.tab.offsetWidth + gap
            if (this.dom.contains(this.mapTab)) {
                this.mapTab.style.right = `${right}px`
                right += this.mapTab.offsetWidth + gap
            }
            if (this.dom.contains(this.sourceTab)) this.sourceTab.style.right = `${right}px`
        })
    }

    ensureRendered() {
        const text = this.node.textContent
        if (text.trim() === '') {
            // Nothing to render -- fall back to Source. setMode is a no-op if
            // already there (can't happen on the very first call, since this
            // is only reached via setMode(false) having just set mode = 'map').
            this.setMode(true)
            return
        }
        if (this.cached && this.lastRenderedText === text) {
            if (this.cached.error) {
                // Re-entering Map (e.g. clicking the tab again) with the same
                // still-invalid text -- bounce back to Source immediately
                // rather than trying to show a stale/absent map. Does not
                // re-report: the error was already reported once, when this
                // cache entry was first populated.
                this.setMode(true)
                return
            }
            // render() already drew this content into this.map, and toggling
            // modes only detaches/reattaches mapContainer (syncModeClasses)
            // without touching the map instance or its layers -- nothing left
            // to do on a cache hit beyond invalidateSize(), already handled there.
            return
        }
        this.lastRenderedText = text
        // Synchronous: parse + validate + render all happen in one pass, so
        // there's no pending/placeholder state and no render-token staleness
        // guard to worry about.
        try {
            const geojson = this.parse(text)
            // Constructed at most once per instance, lazily, here -- the same
            // point the map is first actually needed. mapFactory owns the tile
            // layer too (see defaultMapFactory) -- constructing a
            // fully-initialized map is its whole job, not just L.map() itself.
            const isFirstConstruction = !this.map
            if (isFirstConstruction) this.map = this.mapFactory(this.mapContainer, () => this.reportPersistentTileFailure())
            this.render(geojson, this.map)
            this.cached = { ok: true }
            // A NodeView's dom is NOT connected to the live document at
            // construction time -- ProseMirror builds the node tree first and
            // inserts it afterward -- so mapFactory's own L.map() measures a
            // 0x0 container here. Leaflet caches that size and never
            // auto-refreshes it (no ResizeObserver); a later invalidateSize()
            // call (syncModeClasses, on re-entry into Map mode) heals the
            // SIZE but does not re-run fitBounds on its own, so a multi-point
            // feature fit against the wrong (0x0-derived) measurement stays
            // pinned at the wrong view even once genuinely connected. One-shot
            // correction, deferred to the next frame by which point the
            // container is actually connected -- runs only on first
            // construction, never on a later re-render, which would discard
            // the user's own pan/zoom.
            if (isFirstConstruction) {
                const map = this.map
                requestAnimationFrame(() => {
                    if (!this.mapContainer.isConnected) return // block deleted before the frame fired
                    map.invalidateSize()
                    const bounds = map._geojsonLayer?.getBounds()
                    if (bounds?.isValid()) map.fitBounds(bounds)
                })
            }
        } catch (error) {
            const message = error?.message ?? String(error)
            this.cached = { error: message }
            this.reportError('GeoJSONRenderError', message, text, true)
            this.setMode(true)
        }
    }

    // Called by mapFactory once consecutive tile failures cross its own
    // threshold. navigator.onLine reporting false is ordinary offline use
    // and never reported -- a real but imprecise signal (it reflects local
    // interface state, not actual WAN reachability), but still a strong
    // enough signal to suppress on. true reports a distinct GeoJSONTileError
    // -- alert:true costs nothing extra here since this app's markupError
    // conformer surfaces every report identically regardless of the alert
    // flag. At most once per instance lifetime, regardless of how many
    // further failure episodes occur, since a false positive's cost must
    // stay bounded to a single log entry per block, not a stream.
    reportPersistentTileFailure() {
        if (this.tileErrorReported || !navigator.onLine) return
        this.tileErrorReported = true
        this.reportError('GeoJSONTileError', 'Map tiles failed to load repeatedly while the network appears to be available.', this.node.textContent, true)
    }
}
