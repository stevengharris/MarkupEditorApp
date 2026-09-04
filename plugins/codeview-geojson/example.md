# GeoJSON Plugin Example

Open this file in MarkupEditor with the GeoJSON plugin installed. Each valid code block below should render as a live, interactive map, not raw JSON text (the last block, further down, is deliberately invalid and stays as text -- see its own section) -- select a block and use the **Source** / **Map** tabs to switch between the two views (they appear just above the block, or just below it if the block sits too close to the top of the view). The map is a real [Leaflet](https://leafletjs.com/) map over live [OpenStreetMap](https://www.openstreetmap.org/) tiles: drag to pan, scroll or pinch to zoom, and you should see the "© OpenStreetMap contributors" attribution in its bottom-right corner.

## A single Feature

**Denver, CO** as a `Point`, at its published city-center coordinates, 39.7392° N, 104.9903° W.

```geojson
{
  "type": "Feature",
  "properties": { "name": "Denver, CO" },
  "geometry": {
    "type": "Point",
    "coordinates": [-104.9903, 39.7392]
  }
}
```

Switching this block to **Map** should show a real map of downtown Denver, zoomed in tight around a single marker.

## A FeatureCollection with mixed geometry types

Two real, independently verifiable features, not placeholder coordinates:

- **Colorado's state boundary** (approximated as a rectangle): Colorado's borders are officially defined by the 41st parallel north, the 37th parallel north, the 102nd meridian west, and the 109th meridian west -- a well-documented fact of US geography (see the "Geography" section of Colorado's Wikipedia article, or any atlas). The polygon below uses those four defining parallels/meridians directly (102°03′W and 109°03′W, the exact legally surveyed longitudes, expressed as decimal degrees).
- **Denver, CO** again, this time as one feature among several in the same block.

```geojson
{
  "type": "FeatureCollection",
  "features": [
    {
      "type": "Feature",
      "properties": { "name": "Colorado (approximate boundary)" },
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-109.05, 41.0],
          [-102.05, 41.0],
          [-102.05, 37.0],
          [-109.05, 37.0],
          [-109.05, 41.0]
        ]]
      }
    },
    {
      "type": "Feature",
      "properties": { "name": "Denver, CO" },
      "geometry": {
        "type": "Point",
        "coordinates": [-104.9903, 39.7392]
      }
    }
  ]
}
```

Switching this block to **Map** should show a real map fit to Colorado's outline, with a marker over Denver near its center-east -- the surrounding states, cities, roads, and other real-world detail come from the live tile layer itself, not from anything this plugin draws.

## Offline / tile-load failure

If your network is unavailable when a block above is in **Map** mode, the map should still show its GeoJSON shape (the outline or marker) and its usual pan/zoom controls on a plain gray background, rather than failing silently or looking broken -- the tiles are simply absent. This is expected, not a bug. If your machine still reports network connectivity (a dead uplink, captive portal, or misconfigured VPN can all look this way to the OS) while tiles keep failing to load, each affected block may also log one `GeoJSONTileError` entry in the app's Info panel -- also expected, and it happens at most once per block, not repeatedly.

## Invalid content falls back to Source

The block below is not valid GeoJSON (it's missing `coordinates`). It should stay on **Source**, showing the raw text -- clicking its Map tab bounces straight back to Source with no visible change. Opening this file causes the block to report an error the moment it's rendered, which you should see appear in the app's Info panel; that's expected, not a bug -- it's the same reporting path any invalid content on this block would trigger:

```geojson
{ "type": "Point" }
```
