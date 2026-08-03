const IMG_SRC_PATTERN = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi

// docx's object model can't embed a local relative path or remote URL directly -- it needs
// real embeddable bytes (a data: URI or equivalent). This resolves every non-data: <img> in
// the HTML to a data: URI before conversion, so the rest of the pipeline only deals with
// already-embeddable images.
//
// Deliberately not fetch()/XMLHttpRequest: confirmed empirically that fetch() of a local
// image resolves with an opaque {ok: false, status: 0} response even for a file that's
// readable and displays correctly via a plain <img> tag -- WKWebView restricts fetch()/XHR
// access to file:// URLs separately from native <img> resource loading. Loading via a real
// Image element reuses the resource-loading path already proven for on-screen display, then
// extracts pixels through a <canvas> instead of going through the network stack.
//
// width, when given, is the DISPLAY size to size the DOCX drawing to (the tag's HTML width
// attribute), not a resample target -- the canvas is always drawn at the image's native pixel
// dimensions, so the embedded raster keeps full source resolution regardless of how small the
// document displays it (a photo shown at 300px still embeds at its full native pixel count, so
// it stays sharp when zoomed or printed larger). Returns the display {width, height} alongside
// the data: URI -- DOCX output is sized from the source <img> tag's width/height HTML
// attributes (EMU extent = attribute-pixels * 9525), not from the embedded image's actual
// pixel dimensions, so resolveImages must rewrite those attributes to the returned display
// values.
//
// Height is deliberately not taken from the tag's height attribute, even when present --
// markup.css's `img { height: auto }` means the live editor never uses that attribute for
// layout either; only `width` is real sizing intent there.
export async function loadImageAsDataUri(src, width) {
    const image = new Image()
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
    // toDataURL() always rasterizes to PNG, no lossless passthrough of the original format --
    // an accepted trade-off: DOCX embedding cares about a valid embeddable image, not
    // preserving the exact source encoding. It also throws a SecurityError ("tainted canvas")
    // for a cross-origin remote image without CORS access, confirmed even for the exact live,
    // already-displayed DOM element -- there is no client-side way to read those bytes, so
    // this rejects like any other unrecoverable load failure and resolveImages falls back to
    // a link placeholder.
    return { dataUri: canvas.toDataURL(), width: displayWidth, height: displayHeight }
}

// The visible pixel width of an <img> tag -- only a bare integer counts; a percentage or
// "auto" returns null, same as no attribute at all (loadImageAsDataUri then uses natural size).
export function imageWidth(tag) {
    const match = tag.match(/\bwidth\s*=\s*["'](\d+)["']/i)
    return match ? parseInt(match[1], 10) : null
}

// Link placeholder text for an image that couldn't embed: alt text plus url when alt is
// present, just the url otherwise -- always identifies which image it stands in for.
export function imageLinkLabel(tag, src) {
    const match = tag.match(/\balt\s*=\s*["']([^"']*)["']/i)
    const alt = match && match[1].trim()
    return alt ? `${alt} (${src})` : src
}

// Replaces an existing attribute's value in an HTML tag, or appends it if absent -- keeps
// width/height in sync with the returned display size, since docx sizes the drawing from
// these attributes rather than the embedded image data (see loadImageAsDataUri).
export function setTagAttr(tag, name, value) {
    const existing = new RegExp(`(\\s${name}\\s*=\\s*)["'][^"']*["']`, 'i')
    if (existing.test(tag)) return tag.replace(existing, `$1"${value}"`)
    return tag.replace(/\/?>\s*$/, ` ${name}="${value}"$&`)
}

// `loadImage` is injectable so tests can exercise the control-flow logic (which src needs
// resolving, success/failure/placeholder handling, splicing) without a real DOM -- the
// loading mechanism itself (Image/canvas) is verified manually in the real app.
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
            // A real hyperlink beats dropping the image outright.
            result += `<a href="${src}">${imageLinkLabel(tag, src)}</a>`
        }
    }
    return result + html.slice(lastIndex)
}
