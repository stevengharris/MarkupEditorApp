import { describe, it, expect, vi } from 'vitest'
import { resolveImages, imageWidth, imageLinkLabel, setTagAttr, loadImageAsDataUri, stripPngAncillaryChunks, stripPngMetadata } from '../src/resolveImages.js'

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

// stripPngAncillaryChunks copies chunks through verbatim without validating or recomputing
// CRCs, so a placeholder 4-byte CRC is fine here -- only chunk type/length/data matter for
// what this function does.
function pngChunk(type, data) {
    const length = new Uint8Array(4)
    new DataView(length.buffer).setUint32(0, data.length)
    const typeBytes = [...type].map((c) => c.charCodeAt(0))
    const crc = [0, 0, 0, 0]
    return new Uint8Array([...length, ...typeBytes, ...data, ...crc])
}

function buildPng(chunks) {
    return new Uint8Array([...PNG_SIGNATURE, ...chunks.flatMap((c) => [...c])])
}

describe('imageLinkLabel', () => {
    it('uses "alt (src)" when the tag has alt text', () => {
        expect(imageLinkLabel('<img src="a.png" alt="A picture">', 'a.png')).toBe('A picture (a.png)')
    })

    it('falls back to the bare src when there is no alt attribute', () => {
        expect(imageLinkLabel('<img src="a.png">', 'a.png')).toBe('a.png')
    })

    it('falls back to the bare src when alt is present but empty', () => {
        expect(imageLinkLabel('<img src="a.png" alt="">', 'a.png')).toBe('a.png')
    })
})

describe('imageWidth', () => {
    it('reads a bare pixel width', () => {
        expect(imageWidth('<img src="a.png" width="503" height="30">')).toBe(503)
    })

    it('returns null when there is no width attribute', () => {
        expect(imageWidth('<img src="a.png">')).toBeNull()
    })

    it('ignores a non-pixel value like a percentage', () => {
        expect(imageWidth('<img src="a.png" width="50%">')).toBeNull()
    })
})

describe('setTagAttr', () => {
    it('replaces an existing attribute value', () => {
        expect(setTagAttr('<img src="a.png" width="87" height="60">', 'height', 27))
            .toBe('<img src="a.png" width="87" height="27">')
    })

    it('appends the attribute when absent, before a plain ">"', () => {
        expect(setTagAttr('<img src="a.png" width="87">', 'height', 27))
            .toBe('<img src="a.png" width="87" height="27">')
    })

    it('appends the attribute when absent, before a self-closing "/>"', () => {
        expect(setTagAttr('<img src="a.png"/>', 'width', 87))
            .toBe('<img src="a.png" width="87"/>')
    })
})

describe('resolveImages', () => {
    // loadImageAsDataUri uses Image/canvas -- injected here so these tests exercise
    // resolveImages' control-flow logic without needing real canvas rendering.
    it('leaves html with no <img> tags unchanged', async () => {
        const warnings = []
        const html = '<p>hello</p>'
        const loadImage = vi.fn()
        expect(await resolveImages(html, warnings, loadImage)).toBe(html)
        expect(warnings).toEqual([])
        expect(loadImage).not.toHaveBeenCalled()
    })

    it('leaves a data: URI image untouched, no load attempted', async () => {
        const warnings = []
        const html = '<img src="data:image/png;base64,abc">'
        const loadImage = vi.fn()
        expect(await resolveImages(html, warnings, loadImage)).toBe(html)
        expect(loadImage).not.toHaveBeenCalled()
    })

    it('replaces a local relative src with the resolved data: URI on success', async () => {
        const loadImage = vi.fn().mockResolvedValue({ dataUri: 'data:image/png;base64,AQID', width: 10, height: 8 })
        const warnings = []
        const html = '<p>before</p><img src="steve.png" alt="me"><p>after</p>'

        const result = await resolveImages(html, warnings, loadImage)

        expect(loadImage).toHaveBeenCalledWith('steve.png', null)
        expect(warnings).toEqual([])
        expect(result).toBe('<p>before</p><img src="data:image/png;base64,AQID" alt="me" width="10" height="8"><p>after</p>')
    })

    it('attempts and embeds a remote http(s) src too, not just local paths', async () => {
        const loadImage = vi.fn().mockResolvedValue({ dataUri: 'data:image/png;base64,AQID', width: 10, height: 8 })
        const warnings = []
        const html = '<img src="https://example.com/a.png">'

        const result = await resolveImages(html, warnings, loadImage)

        expect(loadImage).toHaveBeenCalledWith('https://example.com/a.png', null)
        expect(result).toBe('<img src="data:image/png;base64,AQID" width="10" height="8">')
    })

    it("passes the tag's width through to loadImage, and rewrites both attributes to the actual resampled pixel size, so a document-side resize survives export undistorted", async () => {
        const loadImage = vi.fn().mockResolvedValue({ dataUri: 'data:image/png;base64,AQID', width: 503, height: 159 })
        const warnings = []
        const html = '<img src="steve.png" width="503" height="30">'

        const result = await resolveImages(html, warnings, loadImage)

        expect(loadImage).toHaveBeenCalledWith('steve.png', 503)
        expect(result).toBe('<img src="data:image/png;base64,AQID" width="503" height="159">')
    })

    it('replaces the <img> with a link placeholder and warns when loading fails', async () => {
        const loadImage = vi.fn().mockRejectedValue(new Error('failed to load'))
        const warnings = []
        const html = '<p>before</p><img src="missing.png" alt="A missing picture"><p>after</p>'

        const result = await resolveImages(html, warnings, loadImage)

        expect(result).toBe('<p>before</p><a href="missing.png">A missing picture (missing.png)</a><p>after</p>')
        expect(warnings).toEqual(['Could not embed image "missing.png": failed to load -- inserted a link instead'])
    })

    it('placeholder link label falls back to the bare src when the failed image has no alt', async () => {
        const loadImage = vi.fn().mockRejectedValue(new Error('tainted canvas'))
        const warnings = []
        const html = '<img src="https://example.com/blocked.png">'

        const result = await resolveImages(html, warnings, loadImage)

        expect(result).toBe('<a href="https://example.com/blocked.png">https://example.com/blocked.png</a>')
    })

    it('handles a mix of data:, successful, and failed images independently', async () => {
        const loadImage = vi.fn().mockImplementation(async (src) => {
            if (src === 'ok.png') return { dataUri: 'data:image/png;base64,CQ==', width: 4, height: 4 }
            throw new Error('failed to load')
        })
        const warnings = []
        const html =
            '<img src="data:image/png;base64,xyz">' +
            '<img src="ok.png">' +
            '<img src="bad.png">'

        const result = await resolveImages(html, warnings, loadImage)

        expect(result).toBe(
            '<img src="data:image/png;base64,xyz">' +
            '<img src="data:image/png;base64,CQ==" width="4" height="4">' +
            '<a href="bad.png">bad.png</a>'
        )
        expect(warnings).toEqual(['Could not embed image "bad.png": failed to load -- inserted a link instead'])
    })
})

describe('stripPngAncillaryChunks', () => {
    const ihdr = pngChunk('IHDR', new Uint8Array(13))
    const idat = pngChunk('IDAT', new Uint8Array([1, 2, 3]))
    const iend = pngChunk('IEND', new Uint8Array(0))
    // The real eXIf bytes WKWebView's canvas.toDataURL() embedded in a real exported image
    // (decoded from a real demo.docx export) -- carries only ColorSpace=sRGB and the image's
    // own width/height (190x60), both already present in IHDR/sRGB.
    const realExif = pngChunk('eXIf', new Uint8Array([
        77, 77, 0, 42, 0, 0, 0, 8, 0, 1, 135, 105, 0, 4, 0, 0, 0, 1, 0, 0, 0, 26, 0, 0, 0, 0, 0, 3,
        160, 1, 0, 3, 0, 0, 0, 1, 0, 1, 0, 0, 160, 2, 0, 4, 0, 0, 0, 1, 0, 0, 0, 190, 160, 3, 0, 4,
        0, 0, 0, 1, 0, 0, 0, 60, 0, 0, 0, 0,
    ]))

    it('drops a real eXIf chunk, keeping IHDR/IDAT/IEND byte-identical', () => {
        const input = buildPng([ihdr, realExif, idat, iend])
        const expected = buildPng([ihdr, idat, iend])
        expect(stripPngAncillaryChunks(input)).toEqual(expected)
    })

    it('drops sRGB, gAMA, and other ancillary chunks alongside eXIf', () => {
        const srgb = pngChunk('sRGB', new Uint8Array([0]))
        const gama = pngChunk('gAMA', new Uint8Array([0, 0, 0, 1]))
        const input = buildPng([ihdr, srgb, gama, realExif, idat, iend])
        const expected = buildPng([ihdr, idat, iend])
        expect(stripPngAncillaryChunks(input)).toEqual(expected)
    })

    it('keeps PLTE and tRNS for a palette-based image', () => {
        const plte = pngChunk('PLTE', new Uint8Array([255, 0, 0]))
        const trns = pngChunk('tRNS', new Uint8Array([128]))
        const input = buildPng([ihdr, plte, trns, idat, iend])
        expect(stripPngAncillaryChunks(input)).toEqual(input)
    })

    it('preserves multiple IDAT chunks in order', () => {
        const idat2 = pngChunk('IDAT', new Uint8Array([4, 5, 6]))
        const input = buildPng([ihdr, realExif, idat, idat2, iend])
        const expected = buildPng([ihdr, idat, idat2, iend])
        expect(stripPngAncillaryChunks(input)).toEqual(expected)
    })

    it('is a no-op on a PNG with no ancillary chunks', () => {
        const input = buildPng([ihdr, idat, iend])
        expect(stripPngAncillaryChunks(input)).toEqual(input)
    })
})

describe('stripPngMetadata', () => {
    it('round-trips a data: URI, stripping eXIf, decoding back to the same critical-chunk bytes', () => {
        const ihdr = pngChunk('IHDR', new Uint8Array(13))
        const idat = pngChunk('IDAT', new Uint8Array([9, 9, 9]))
        const iend = pngChunk('IEND', new Uint8Array(0))
        const exif = pngChunk('eXIf', new Uint8Array([1, 2, 3, 4]))
        const withExif = buildPng([ihdr, exif, idat, iend])
        const withoutExif = buildPng([ihdr, idat, iend])

        let binary = ''
        for (const byte of withExif) binary += String.fromCharCode(byte)
        const inputDataUri = `data:image/png;base64,${btoa(binary)}`

        const result = stripPngMetadata(inputDataUri)
        expect(result.startsWith('data:image/png;base64,')).toBe(true)
        const resultBytes = Uint8Array.from(atob(result.slice(result.indexOf(',') + 1)), (c) => c.charCodeAt(0))
        expect(resultBytes).toEqual(withoutExif)
    })
})

describe('loadImageAsDataUri crossOrigin scoping', () => {
    // The actual canvas-tainting/CORS behavior needs a real browser and is verified manually
    // (see the real-app remote-image Test Plan scenarios) -- this environment has no real canvas
    // rendering engine, so Image/canvas are fully stubbed here rather than exercised for real.
    // This isolates and asserts the one thing that IS meaningfully testable without a browser:
    // which sources get `crossOrigin` set at all.
    it('sets crossOrigin="anonymous" for http(s) sources only, not local/relative/file: sources', async () => {
        const seenCrossOrigin = []
        class FakeImage {
            set crossOrigin(value) { seenCrossOrigin.push(value) }
            set src(value) {
                this.naturalWidth = 10
                this.naturalHeight = 10
                queueMicrotask(() => this.onload?.())
            }
        }
        vi.stubGlobal('Image', FakeImage)
        vi.stubGlobal('document', {
            createElement: (tag) => {
                if (tag !== 'canvas') throw new Error(`unexpected createElement("${tag}")`)
                return {
                    getContext: () => ({ drawImage: () => {} }),
                    toDataURL: () => 'data:image/png;base64,FAKE',
                }
            },
        })

        try {
            await loadImageAsDataUri('https://example.com/a.png', null)
            await loadImageAsDataUri('http://example.com/a.png', null)
            await loadImageAsDataUri('steve.png', null)
            await loadImageAsDataUri('file:///tmp/b.png', null)
        } finally {
            vi.unstubAllGlobals()
        }

        expect(seenCrossOrigin).toEqual(['anonymous', 'anonymous'])
    })
})
