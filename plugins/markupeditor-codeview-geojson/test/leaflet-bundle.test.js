import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'

// pretest (npm run build) has already produced dist/ by the time vitest runs.
// Reintroduced here (Phase 2, map lifecycle) now that geojsonview.js
// genuinely imports leaflet -- an equivalent test existed during Phase 1
// scaffolding, against a placeholder entry point, and was deliberately
// removed when that placeholder was replaced by the real (Leaflet-free at
// the time) GeoJSONPlugin/GeoJSONView.
let bundle

beforeAll(() => {
  const distPath = path.resolve(import.meta.dirname, '../dist/markupeditor-codeview-geojson.js')
  bundle = readFileSync(distPath, 'utf8')
})

describe('the built bundle', () => {
  it('contains Leaflet\'s own JS, not a CDN reference', () => {
    expect(bundle).toMatch(/Leaflet 1\.9/)
    expect(bundle).not.toMatch(/unpkg\.com|cdn\.jsdelivr|<script/)
  })

  it('contains Leaflet\'s CSS inlined as a constructable stylesheet, not injected via document.head', () => {
    expect(bundle).toContain('.leaflet-container')
    expect(bundle).toContain('.leaflet-tile-pane')
    // rollup-plugin-import-css's inject:true mode is explicitly wrong here --
    // the editor's content lives in a Shadow DOM a document.head injection
    // never reaches. Confirm we didn't regress to that mode.
    expect(bundle).not.toMatch(/document\.head\.appendChild\(document\.createElement\(.style.\)\)/)
  })

  it('externalizes markupeditor to the shared runtime bundle instead of duplicating it', () => {
    expect(bundle).toContain("from './markup-editor.js'")
  })

  // A getComputedStyle assertion against a mounted mapContainer was tried
  // instead of this regex and rejected: confirmed directly (not assumed)
  // that this jsdom setup resolves computed style for a real <style> tag
  // but NOT for adoptedStyleSheets -- a well-documented jsdom gap -- and
  // adoptedStyleSheets is the plugin's actual production mechanism
  // (required by Finding 18; a <style>-tag test would validate a code path
  // the plugin doesn't use). A static check on the CSS source is the only
  // regression guard actually available here, not merely the first one
  // reached for. Real bug this guards against, caught live: Leaflet's own
  // panes are all position: absolute (leaflet.css), which contribute
  // nothing to a parent's height in normal flow -- without an explicit
  // height here, .geojson-map collapses to 0px and the entire map (tiles,
  // vector layers, controls -- all otherwise rendered correctly) is
  // invisible despite a completely correct DOM.
  it('.geojson-map has an explicit non-zero height, not left to its (all position:absolute) Leaflet children', () => {
    const match = bundle.match(/\.geojson-map\s*\{[^}]*\}/)
    expect(match).not.toBeNull()
    expect(match[0]).toMatch(/height:\s*[1-9]/)
  })
})

describe('the plugin\'s own stylesheet', () => {
  // OSM's tile usage policy requires visible attribution -- checked against
  // the plugin's own authored source (not the built bundle, which also
  // contains Leaflet's own CSS defining .leaflet-control-attribution
  // legitimately) so this can assert absence cleanly: this plugin has no
  // legitimate reason to reference that selector at all, so any match here
  // is this stylesheet doing something to it, not Leaflet's own styling.
  //
  // Scope, stated plainly: this only catches a rule that names the
  // attribution control directly. It does NOT catch an indirect hazard --
  // an overflow/z-index/pointer-events rule on .geojson-map (the control's
  // actual DOM ancestor) that clips or covers it without ever naming it.
  // The test below guards that specific, narrower case; nothing here
  // guards against every conceivable indirect path (e.g. a hazard
  // introduced via a sibling rule interacting with Leaflet's own CSS).
  it('never references .leaflet-control-attribution -- nothing here can hide, clip, or off-screen it', () => {
    const cssPath = path.resolve(import.meta.dirname, '../styles/geojson.css')
    const css = readFileSync(cssPath, 'utf8')
    expect(css).not.toMatch(/leaflet-control-attribution/)
  })

  it('no .geojson-map rule -- base or an override, e.g. under @media (prefers-color-scheme: dark), matching .geojson-mode-toggle/.geojson-map-selected\'s own established pattern -- sets overflow/z-index/pointer-events -- the attribution control\'s actual DOM ancestor can\'t clip or cover it indirectly either', () => {
    const cssPath = path.resolve(import.meta.dirname, '../styles/geojson.css')
    const css = readFileSync(cssPath, 'utf8')
    const blocks = [...css.matchAll(/\.geojson-map\s*\{[^}]*\}/g)]
    expect(blocks.length).toBeGreaterThan(0)
    for (const block of blocks) expect(block[0]).not.toMatch(/overflow|z-index|pointer-events/)
  })
})
