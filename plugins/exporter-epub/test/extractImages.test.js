import { describe, it, expect } from 'vitest'
import { extractImages } from '../src/extractImages.js'

// A minimal but genuinely valid 1x1 PNG, base64-encoded -- same fixture exporter-docx's tests
// use.
const ONE_PIXEL_PNG_BASE64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

describe('extractImages', () => {
    it('leaves html with no <img> tags unchanged', () => {
        const warnings = []
        const { html, images } = extractImages('<p>hello</p>', warnings)
        expect(html).toBe('<p>hello</p>')
        expect(images).toEqual([])
        expect(warnings).toEqual([])
    })

    it('rewrites a data: PNG <img> to a relative images/ href and returns its decoded bytes', () => {
        const warnings = []
        const html = `<p><img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}" width="1" height="1"></p>`
        const { html: rewritten, images } = extractImages(html, warnings)
        expect(warnings).toEqual([])
        expect(rewritten).toBe('<p><img src="images/image1.png" width="1" height="1"></p>')
        expect(images).toHaveLength(1)
        expect(images[0].filename).toBe('images/image1.png')
        expect(images[0].mediaType).toBe('image/png')
        expect(images[0].bytes).toBeInstanceOf(Uint8Array)
        expect(Buffer.from(images[0].bytes).toString('base64')).toBe(ONE_PIXEL_PNG_BASE64)
    })

    it('assigns sequential filenames across multiple images, independent of mime type', () => {
        const jpegBase64 = 'AQID' // arbitrary bytes, not a real decodable JPEG -- extractImages never validates pixel content
        const warnings = []
        const html =
            `<img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}">` +
            `<img src="data:image/jpeg;base64,${jpegBase64}">`
        const { html: rewritten, images } = extractImages(html, warnings)
        expect(warnings).toEqual([])
        expect(rewritten).toBe('<img src="images/image1.png"><img src="images/image2.jpg">')
        expect(images.map((i) => i.filename)).toEqual(['images/image1.png', 'images/image2.jpg'])
        expect(images[1].mediaType).toBe('image/jpeg')
    })

    it('warns but embeds anyway for a non-core EPUB media type', () => {
        const warnings = []
        const html = `<img src="data:image/webp;base64,${ONE_PIXEL_PNG_BASE64}">`
        const { images } = extractImages(html, warnings)
        expect(warnings).toEqual([expect.stringContaining('non-core EPUB media type "image/webp"')])
        expect(images[0].mediaType).toBe('image/webp')
        expect(images[0].filename).toBe('images/image1.webp')
    })

    it('warns and leaves the tag untouched for a non-data: src (resolveImages should already have run)', () => {
        const warnings = []
        const html = '<img src="not-yet-resolved.png">'
        const { html: rewritten, images } = extractImages(html, warnings)
        expect(rewritten).toBe(html)
        expect(images).toEqual([])
        expect(warnings).toEqual([expect.stringContaining('unresolved src')])
    })

    it('handles a mix of embeddable and unresolved images independently', () => {
        const warnings = []
        const html =
            `<img src="data:image/png;base64,${ONE_PIXEL_PNG_BASE64}">` +
            '<img src="still-a-path.png">'
        const { html: rewritten, images } = extractImages(html, warnings)
        expect(rewritten).toBe('<img src="images/image1.png"><img src="still-a-path.png">')
        expect(images).toHaveLength(1)
        expect(warnings).toEqual([expect.stringContaining('unresolved src')])
    })
})
