import { MU } from 'markupeditor'
import { bytesToBase64 } from './base64.js'
import { stripPngMetadata } from './images.js'

// <pre><code class="language-X"> is how a code_block serializes in MU.getHTML()'s output.
const CODE_BLOCK_PATTERN = /<pre><code class="language-([\w-]+)">([\s\S]*?)<\/code><\/pre>/g

const DIAGRAM_LANGUAGES = { mermaid: 'Mermaid' }

const RASTER_SCALE = 2

function decodeEntities(text) {
    return text
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#0?39;/g, "'")
        .replace(/&amp;/g, '&')
}

const round = (value) => Math.round(value * 100) / 100

// The diagram's intrinsic size, from its viewBox. Renderers emit width="100%", which has no
// size of its own.
export function svgSize(svg) {
    const match = svg.match(/<svg\b[^>]*\bviewBox="([^"]+)"/)
    const [, , width, height] = match ? match[1].trim().split(/[\s,]+/).map(Number) : []
    if (!(width > 0) || !(height > 0)) throw new Error('the diagram has no usable viewBox')
    return { width, height }
}

function svgDataUri(svg) {
    return `data:image/svg+xml;base64,${bytesToBase64(new TextEncoder().encode(svg))}`
}

// Draws the SVG on a white canvas and returns it as a PNG data: URI. The SVG needs explicit
// pixel dimensions to be drawn at a known size.
export async function rasterizeSvg(svg, width, height) {
    const sized = svg.replace(/<svg\b([^>]*)>/, (_, attributes) => {
        const rest = attributes.replace(/\swidth="[^"]*"/, '').replace(/\sheight="[^"]*"/, '')
        return `<svg${rest} width="${width}" height="${height}">`
    })
    const image = new Image()
    await new Promise((resolve, reject) => {
        image.onload = resolve
        image.onerror = () => reject(new Error('the diagram image failed to load'))
        image.src = svgDataUri(sized)
    })
    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(width * RASTER_SCALE)
    canvas.height = Math.ceil(height * RASTER_SCALE)
    const context = canvas.getContext('2d')
    context.fillStyle = '#fff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.scale(RASTER_SCALE, RASTER_SCALE)
    context.drawImage(image, 0, 0, width, height)
    return stripPngMetadata(canvas.toDataURL('image/png'))
}

// Replaces each diagram code block in `html` with a paragraph holding an <img> carrying the rendered diagram, so
// the exporter's image handling takes over from there. A diagram language's renderer is
// `MU.diagramRenderers[language](source, { plainLabels })`, returning the SVG as a string; the
// plugin that renders the language registers it.
//
// format 'svg' embeds the SVG itself and asks for plain <text> labels, which readers support
// more widely than the <foreignObject> labels. Format 'png' rasterizes it. `maxWidth` scales a
// wider diagram down to fit the page. A block that cannot be rendered stays as a code block,
// with a warning.
export async function embedDiagrams(html, warnings, { format, maxWidth, rasterize = rasterizeSvg }) {
    const renderers = MU.diagramRenderers ?? {}
    const missing = new Set()
    let result = ''
    let lastIndex = 0
    for (const match of html.matchAll(CODE_BLOCK_PATTERN)) {
        const [block, language, code] = match
        const label = DIAGRAM_LANGUAGES[language]
        if (!label) continue
        result += html.slice(lastIndex, match.index)
        lastIndex = match.index + block.length
        const render = renderers[language]
        if (!render) {
            missing.add(label)
            result += block
            continue
        }
        try {
            const svg = await render(decodeEntities(code), { plainLabels: format === 'svg' })
            let { width, height } = svgSize(svg)
            const src = format === 'svg' ? svgDataUri(svg) : await rasterize(svg, width, height)
            if (maxWidth && width > maxWidth) {
                height = round(height * maxWidth / width)
                width = maxWidth
            }
            result += `<p><img src="${src}" alt="${label} diagram" width="${width}" height="${height}"></p>`
        } catch (error) {
            warnings.push(`${label} diagram could not be rendered (${error.message}) -- left as a code block`)
            result += block
        }
    }
    for (const label of missing) {
        warnings.push(`${label} diagrams were left as code blocks because the ${label} plugin is not installed`)
    }
    return result + html.slice(lastIndex)
}
