const GEOMETRY_TYPES = new Set([
    'Point', 'MultiPoint', 'LineString', 'MultiLineString',
    'Polygon', 'MultiPolygon', 'GeometryCollection'
])

export function isGeojsonLanguage(language) {
    return (language ?? '').trim().toLowerCase() === 'geojson'
}

function validateGeometry(geom, path) {
    if (geom === null) return // a Feature's geometry is allowed to be null (RFC 7946 §3.2)
    if (typeof geom !== 'object' || Array.isArray(geom)) throw new Error(`${path} must be an object`)
    if (!GEOMETRY_TYPES.has(geom.type)) throw new Error(`${path}.type: unrecognized geometry type "${geom.type}"`)
    if (geom.type === 'GeometryCollection') {
        if (!Array.isArray(geom.geometries)) throw new Error(`${path}.geometries must be an array`)
        geom.geometries.forEach((g, i) => validateGeometry(g, `${path}.geometries[${i}]`))
        return
    }
    if (!Array.isArray(geom.coordinates)) throw new Error(`${path}.coordinates must be an array`)
}

// Structural validation only (types + array shape), not a full RFC 7946
// schema check -- enough to reject non-GeoJSON JSON (a random object, a
// mermaid diagram pasted into the wrong block, an empty {}) and hand Leaflet
// something it can actually render, without reimplementing a JSON Schema
// validator. Throws with a descriptive message on rejection; returns the
// parsed object unchanged on success.
export function parseGeojson(text) {
    let obj
    try {
        obj = JSON.parse(text)
    } catch (error) {
        throw new Error(`Invalid JSON: ${error.message}`)
    }
    if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
        throw new Error('GeoJSON content must be a JSON object')
    }
    if (obj.type === 'Feature') {
        if (!('geometry' in obj)) throw new Error('Feature.geometry is required')
        validateGeometry(obj.geometry, 'geometry')
    } else if (obj.type === 'FeatureCollection') {
        if (!Array.isArray(obj.features)) throw new Error('FeatureCollection.features must be an array')
        obj.features.forEach((f, i) => {
            if (f?.type !== 'Feature') throw new Error(`features[${i}].type must be "Feature"`)
            if (!('geometry' in f)) throw new Error(`features[${i}].geometry is required`)
            validateGeometry(f.geometry, `features[${i}].geometry`)
        })
    } else if (GEOMETRY_TYPES.has(obj.type)) {
        validateGeometry(obj, 'geometry') // a bare Geometry or GeometryCollection, not wrapped in a Feature
    } else {
        throw new Error(`Unrecognized GeoJSON type "${obj.type}"`)
    }
    return obj
}
