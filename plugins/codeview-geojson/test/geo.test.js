import { describe, it, expect } from 'vitest'
import { isGeojsonLanguage, parseGeojson } from '../src/geo.js'

// Pure unit coverage for geo.js -- no DOM, no EditorView. GeoJSONView's own
// integration with parse (caching, error fallback, mode switching) is
// covered in geojsonview.test.js instead.

describe('isGeojsonLanguage', () => {
  it('matches "geojson" case-insensitively and trimmed', () => {
    expect(isGeojsonLanguage('geojson')).toBe(true)
    expect(isGeojsonLanguage('GeoJSON')).toBe(true)
    expect(isGeojsonLanguage('  geojson  ')).toBe(true)
  })

  it('rejects other languages, null, and undefined', () => {
    expect(isGeojsonLanguage('json')).toBe(false)
    expect(isGeojsonLanguage('mermaid')).toBe(false)
    expect(isGeojsonLanguage(null)).toBe(false)
    expect(isGeojsonLanguage(undefined)).toBe(false)
  })
})

// Real, independently verifiable coordinates -- Colorado's boundary is
// officially the 41st parallel north, the 37th parallel north, the 102nd
// meridian west, and the 109th meridian west (Wikipedia: "Colorado" ->
// Geography); Denver's coordinates are its official published city center,
// 39.7392 N, 104.9903 W.
const coloradoPolygon = {
  type: 'Feature',
  properties: { name: 'Colorado (approximate)' },
  geometry: {
    type: 'Polygon',
    coordinates: [[
      [-109.05, 41.0], [-102.05, 41.0], [-102.05, 37.0], [-109.05, 37.0], [-109.05, 41.0]
    ]]
  }
}

const denverPoint = {
  type: 'Feature',
  properties: { name: 'Denver, CO' },
  geometry: { type: 'Point', coordinates: [-104.9903, 39.7392] }
}

describe('parseGeojson: accepted shapes', () => {
  it('accepts a Feature with a Polygon geometry', () => {
    expect(parseGeojson(JSON.stringify(coloradoPolygon))).toEqual(coloradoPolygon)
  })

  it('accepts a FeatureCollection', () => {
    const fc = { type: 'FeatureCollection', features: [coloradoPolygon, denverPoint] }
    expect(parseGeojson(JSON.stringify(fc))).toEqual(fc)
  })

  it('accepts a bare Geometry, not wrapped in a Feature', () => {
    const point = { type: 'Point', coordinates: [-104.9903, 39.7392] }
    expect(parseGeojson(JSON.stringify(point))).toEqual(point)
  })

  it('accepts a GeometryCollection', () => {
    const gc = { type: 'GeometryCollection', geometries: [denverPoint.geometry, coloradoPolygon.geometry] }
    expect(parseGeojson(JSON.stringify(gc))).toEqual(gc)
  })

  it('accepts a Feature with a null geometry (RFC 7946 §3.2)', () => {
    const f = { type: 'Feature', properties: {}, geometry: null }
    expect(parseGeojson(JSON.stringify(f))).toEqual(f)
  })
})

describe('parseGeojson: rejected input', () => {
  it('rejects malformed JSON', () => {
    expect(() => parseGeojson('{not json')).toThrow(/Invalid JSON/)
  })

  it('rejects a JSON array at the top level', () => {
    expect(() => parseGeojson('[1,2,3]')).toThrow(/must be a JSON object/)
  })

  it('rejects an object with no recognizable GeoJSON type (e.g. mermaid source pasted into the wrong block)', () => {
    expect(() => parseGeojson('{"foo": "bar"}')).toThrow(/Unrecognized GeoJSON type/)
  })

  it('rejects a Feature missing its geometry key', () => {
    expect(() => parseGeojson(JSON.stringify({ type: 'Feature', properties: {} }))).toThrow(/geometry is required/)
  })

  it('rejects a FeatureCollection whose features is not an array', () => {
    expect(() => parseGeojson(JSON.stringify({ type: 'FeatureCollection', features: 'nope' }))).toThrow(/features must be an array/)
  })

  it('rejects a FeatureCollection element that is not type Feature', () => {
    const fc = { type: 'FeatureCollection', features: [{ type: 'Point', coordinates: [0, 0] }] }
    expect(() => parseGeojson(JSON.stringify(fc))).toThrow(/features\[0\].type must be "Feature"/)
  })

  it('rejects a geometry with an unrecognized type', () => {
    expect(() => parseGeojson(JSON.stringify({ type: 'Blob', coordinates: [0, 0] }))).toThrow(/Unrecognized GeoJSON type/)
  })

  it('rejects a geometry missing coordinates', () => {
    expect(() => parseGeojson(JSON.stringify({ type: 'Point' }))).toThrow(/coordinates must be an array/)
  })
})
