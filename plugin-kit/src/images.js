import { base64ToBytes, bytesToBase64 } from './base64.js'

const IMG_SRC_PATTERN = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi

const PNG_SIGNATURE_LENGTH = 8
const PNG_CHUNKS_TO_KEEP = new Set(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND'])

// Strips every PNG chunk except the ones that actually matter for decoding the pixels
// (IHDR/PLTE/tRNS/IDAT/IEND). WKWebView's canvas.toDataURL() embeds an eXIf chunk (PNG's 2017
// spec addition) even for a synthetic canvas with no real camera provenance -- decoding a real
// one showed it carries only the image's width/height and an sRGB colorspace flag, both
// already present in IHDR/sRGB. A consumer that doesn't recognize eXIf is supposed to skip it
// per the PNG spec's ancillary-chunk convention, but not every real-world parser does --
// dropping it outright costs nothing, since none of the stripped chunks carry information
// IHDR/IDAT don't already.
export function stripPngAncillaryChunks(bytes) {
    const kept = [bytes.subarray(0, PNG_SIGNATURE_LENGTH)]
    let pos = PNG_SIGNATURE_LENGTH
    while (pos < bytes.length) {
        const length = new DataView(bytes.buffer, bytes.byteOffset + pos, 4).getUint32(0)
        const type = String.fromCharCode(...bytes.subarray(pos + 4, pos + 8))
        const chunkEnd = pos + 12 + length // length(4) + type(4) + data(length) + crc(4)
        if (PNG_CHUNKS_TO_KEEP.has(type)) kept.push(bytes.subarray(pos, chunkEnd))
        pos = chunkEnd
    }
    const result = new Uint8Array(kept.reduce((sum, chunk) => sum + chunk.length, 0))
    let offset = 0
    for (const chunk of kept) {
        result.set(chunk, offset)
        offset += chunk.length
    }
    return result
}

// Re-encodes a `data:image/png;base64,...` URI with stripPngAncillaryChunks applied.
export function stripPngMetadata(dataUri) {
    const base64 = dataUri.slice(dataUri.indexOf(',') + 1)
    const stripped = stripPngAncillaryChunks(base64ToBytes(base64))
    return `data:image/png;base64,${bytesToBase64(stripped)}`
}

// A format that embeds images needs real bytes, not a local path or remote URL -- this
// resolves every non-data: <img> to a data: URI before conversion.
//
// Not fetch()/XMLHttpRequest: fetch() of a local image resolves with an opaque {ok: false,
// status: 0} even for a file that displays correctly via a plain <img> tag -- WKWebView
// restricts fetch()/XHR access to file:// URLs separately from native <img> loading. A real
// Image element reuses the resource-loading path already proven for on-screen display, then
// extracts pixels via <canvas>.
//
// width, when given, is the DISPLAY size (the tag's HTML width attribute), not a resample
// target -- the canvas is always drawn at native pixel dimensions, so the embedded raster keeps
// full source resolution regardless of display size. Returns the display {width, height}
// alongside the data: URI; resolveImages rewrites the tag's width/height attributes to those
// values, since exporters size the image from them, not from the embedded pixel data.
//
// Height is not taken from the tag's height attribute, even when present -- markup.css's
// `img { height: auto }` means the live editor never uses that attribute for layout; only
// `width` is real sizing intent.
export async function loadImageAsDataUri(src, width) {
    const image = new Image()
    // CORS mode is required for canvas.toDataURL() to read a cross-origin image's pixels even
    // when the server sends a permissive Access-Control-Allow-Origin header -- without this,
    // the browser fetches in default no-cors mode and the image stays canvas-tainted regardless
    // of server headers. Scoped to http(s) only: local file:// loading already works via the
    // plain <img> path above, and crossOrigin there is untested against WKWebView's separate
    // file:// restrictions.
    if (/^https?:\/\//i.test(src)) {
        image.crossOrigin = 'anonymous'
    }
    await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = () => reject(new Error('failed to load'))
        image.src = src
    })
    const canvas = document.createElement('canvas')
    canvas.width = image.naturalWidth
    canvas.height = image.naturalHeight
    canvas.getContext('2d').drawImage(image, 0, 0)
    const hasDisplayWidth = width && image.naturalWidth
    const displayWidth = hasDisplayWidth ? width : image.naturalWidth
    const displayHeight = hasDisplayWidth
        ? Math.round(width * (image.naturalHeight / image.naturalWidth))
        : image.naturalHeight
    // toDataURL() always rasterizes to PNG, not the original format -- accepted, since embedding
    // only needs a valid image. Throws a SecurityError for a tainted canvas (a
    // cross-origin image without CORS access), with no client-side way to recover the bytes;
    // this rejects like any other load failure and resolveImages falls back to a link.
    return { dataUri: stripPngMetadata(canvas.toDataURL()), width: displayWidth, height: displayHeight }
}

// The visible pixel width of an <img> tag -- only a bare integer counts; a percentage or
// "auto" returns null, same as no attribute (loadImageAsDataUri then uses natural size).
export function imageWidth(tag) {
    const match = tag.match(/\bwidth\s*=\s*["'](\d+)["']/i)
    return match ? parseInt(match[1], 10) : null
}

// Link placeholder text for an image that couldn't embed: alt text plus url when alt is
// present, just the url otherwise. `alt`/`src` come from `MU.getHTML()`'s output, serialized
// via a real ProseMirror DOMSerializer/DOM innerHTML (markup.js's getHTML()) -- already
// correctly HTML-entity-escaped by construction, so the fallback `<a href="...">` below
// concatenates them raw. Escaping again would double-escape legitimate content.
export function imageLinkLabel(tag, src) {
    const match = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)
    const alt = match && match[1].trim()
    return alt ? `${alt} (${src})` : src
}

// Replaces an existing attribute's value in an HTML tag, or appends it if absent -- keeps
// width/height in sync with the returned display size, since exporters size the image from
// these attributes, not the embedded image data.
export function setTagAttr(tag, name, value) {
    const existing = new RegExp(`(\\s${name}\\s*=\\s*)["'][^"']*["']`, 'i')
    if (existing.test(tag)) return tag.replace(existing, `$1"${value}"`)
    return tag.replace(/\/?>\s*$/, ` ${name}="${value}"$&`)
}

// `loadImage` is injectable so tests can exercise the control-flow logic without a real DOM --
// the loading mechanism itself (Image/canvas) is verified manually.
export async function resolveImages(html, warnings, loadImage = loadImageAsDataUri) {
    let result = ''
    let lastIndex = 0
    for (const match of html.matchAll(IMG_SRC_PATTERN)) {
        const [tag, src] = match
        if (src.startsWith('data:')) continue // already embedded, nothing to do
        result += html.slice(lastIndex, match.index)
        lastIndex = match.index + tag.length
        try {
            const { dataUri, width, height } = await loadImage(src, imageWidth(tag))
            let resolvedTag = tag.replace(src, dataUri)
            resolvedTag = setTagAttr(resolvedTag, 'width', width)
            resolvedTag = setTagAttr(resolvedTag, 'height', height)
            result += resolvedTag
        } catch (error) {
            warnings.push(`Could not embed image "${src}": ${error.message} -- inserted a link instead`)
            result += `<a href="${src}">${imageLinkLabel(tag, src)}</a>`
        }
    }
    return result + html.slice(lastIndex)
}
