// Runs AFTER resolveImages: every embeddable <img src> is by then already a data: URI (either
// one resolveImages produced from a local/remote source, or one the source document already
// carried directly -- resolveImages leaves an existing data: URI untouched). An unresolvable
// image never reaches here -- resolveImages already rewrote it to a plain <a> link placeholder.
//
// EPUB wants each image as a real zip entry referenced by a relative href (schema: OPF
// manifest + XHTML <img src>), not a data: URI left inline -- this is the one real divergence
// from DOCX, whose ImageRun embeds the data: URI's bytes directly with no separate file/href
// concept. This module is that difference: it decodes each data: URI back to raw bytes and
// hands out a stable images/imageN.ext href, one entry per <img> occurrence in the document (no
// content-addressed de-duplication -- simpler, and correct even if two different images happen
// to hash-collide, at the cost of one zip entry per occurrence rather than per distinct image).
const IMG_SRC_PATTERN = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi
const DATA_URI_PATTERN = /^data:image\/([\w+.-]+);base64,(.+)$/s

// Maps a data: URI's MIME subtype to both a manifest media-type and a file extension. EPUB3's
// core media types (OPF spec, Core Media Types table) are GIF/JPEG/PNG/SVG -- WebP is a common,
// widely-supported non-core extension many reading systems accept too. An unrecognized subtype
// still gets a best-effort passthrough (extension = subtype, media-type = "image/<subtype>")
// rather than being dropped, with a warning -- some reading systems may reject it, but silently
// discarding a real embedded image is worse.
const MIME_TO_EXT = {
    png: 'png',
    jpeg: 'jpg',
    gif: 'gif',
    'svg+xml': 'svg',
    webp: 'webp',
}
const CORE_MEDIA_SUBTYPES = new Set(['png', 'jpeg', 'gif', 'svg+xml'])

function base64ToBytes(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}

// Entry point: rewrites every embedded data: URI <img> in `html` to a relative
// "images/imageN.ext" href and returns the decoded bytes for each as a zip-ready manifest
// entry list. `html` and its returned `html` are XHTML-agnostic plain strings -- htmlToXhtml.js
// runs on the result afterward, same ordering DOCX uses for resolveImages -> htmlToDocxChildren.
export function extractImages(html, warnings = []) {
    const images = []
    let result = ''
    let lastIndex = 0
    let nextId = 1

    for (const match of html.matchAll(IMG_SRC_PATTERN)) {
        const [tag, src] = match
        result += html.slice(lastIndex, match.index)
        lastIndex = match.index + tag.length

        const dataMatch = src.match(DATA_URI_PATTERN)
        if (!dataMatch) {
            // Not a data: URI at all -- resolveImages should have already turned every
            // embeddable <img> into one (or replaced it with a link placeholder on failure).
            // Left as-is rather than dropped; htmlToXhtml.js's <img> handler warns again
            // when it can't use an unresolved src either.
            warnings.push(`<img> with an unresolved src is not embeddable in an EPUB -- expected resolveImages to have already run (got "${src}")`)
            result += tag
            continue
        }

        const [, subtype, base64] = dataMatch
        if (!CORE_MEDIA_SUBTYPES.has(subtype)) {
            warnings.push(`<img> data: URI has non-core EPUB media type "image/${subtype}" -- embedded anyway, but some reading systems may reject it`)
        }
        const ext = MIME_TO_EXT[subtype] ?? subtype
        const mediaType = `image/${subtype}`
        const filename = `images/image${nextId}.${ext}`
        nextId++

        let bytes
        try {
            bytes = base64ToBytes(base64)
        } catch (error) {
            warnings.push(`<img> data: URI could not be decoded (${error.message}) -- skipped`)
            continue
        }

        images.push({ filename, mediaType, bytes })
        result += tag.replace(src, filename)
    }

    return { html: result + html.slice(lastIndex), images }
}
