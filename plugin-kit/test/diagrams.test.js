import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MU } from 'markupeditor-plugin-kit/testing/stub'
import { embedDiagrams, svgSize } from '../src/diagrams.js'

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100%" viewBox="0 0 200.5 100"><text>hi</text></svg>'
const BLOCK = '<pre><code class="language-mermaid">graph TD\n  A--&gt;B</code></pre>'

let render
beforeEach(() => {
    render = vi.fn(async () => SVG)
    MU.diagramRenderers = { mermaid: render }
})

describe('svgSize', () => {
    it('reads the viewBox dimensions', () => {
        expect(svgSize(SVG)).toEqual({ width: 200.5, height: 100 })
    })

    it('throws when there is no usable viewBox', () => {
        expect(() => svgSize('<svg></svg>')).toThrow(/viewBox/)
    })
})

describe('embedDiagrams', () => {
    it('replaces a mermaid code block with an SVG data: URI image and passes the decoded source to the renderer', async () => {
        const warnings = []
        const html = await embedDiagrams(`<p>a</p>${BLOCK}<p>b</p>`, warnings, { format: 'svg' })
        expect(render).toHaveBeenCalledWith('graph TD\n  A-->B', { plainLabels: true })
        expect(html).toMatch(/^<p>a<\/p><p><img src="data:image\/svg\+xml;base64,[A-Za-z0-9+/=]+" alt="Mermaid diagram" width="200.5" height="100"><\/p><p>b<\/p>$/)
        const base64 = html.match(/base64,([^"]+)"/)[1]
        expect(atob(base64)).toBe(SVG)
        expect(warnings).toEqual([])
    })

    it('encodes non-ASCII SVG text as UTF-8', async () => {
        render.mockResolvedValue('<svg viewBox="0 0 10 10"><text>é→</text></svg>')
        const html = await embedDiagrams(BLOCK, [], { format: 'svg' })
        const bytes = Uint8Array.from(atob(html.match(/base64,([^"]+)"/)[1]), (c) => c.charCodeAt(0))
        expect(new TextDecoder().decode(bytes)).toContain('é→')
    })

    it('rasterizes for png, with the SVG and its size, and uses the data URI it returns', async () => {
        const rasterize = vi.fn(async () => 'data:image/png;base64,AAAA')
        const html = await embedDiagrams(BLOCK, [], { format: 'png', rasterize })
        expect(render).toHaveBeenCalledWith('graph TD\n  A-->B', { plainLabels: false })
        expect(rasterize).toHaveBeenCalledWith(SVG, 200.5, 100)
        expect(html).toBe('<p><img src="data:image/png;base64,AAAA" alt="Mermaid diagram" width="200.5" height="100"></p>')
    })

    it('scales a diagram wider than maxWidth down, keeping its proportions', async () => {
        const html = await embedDiagrams(BLOCK, [], { format: 'svg', maxWidth: 100 })
        expect(html).toContain('width="100" height="49.88"')
    })

    it('leaves other code blocks alone', async () => {
        const html = `<pre><code class="language-js">let a</code></pre><pre><code>plain</code></pre>`
        expect(await embedDiagrams(html, [], { format: 'svg' })).toBe(html)
        expect(render).not.toHaveBeenCalled()
    })

    it('keeps the code block and warns when the renderer throws', async () => {
        render.mockRejectedValue(new Error('Parse error'))
        const warnings = []
        expect(await embedDiagrams(BLOCK, warnings, { format: 'svg' })).toBe(BLOCK)
        expect(warnings).toEqual(['Mermaid diagram could not be rendered (Parse error) -- left as a code block'])
    })

    it('keeps the code block and warns when the SVG has no size', async () => {
        render.mockResolvedValue('<svg></svg>')
        const warnings = []
        expect(await embedDiagrams(BLOCK, warnings, { format: 'svg' })).toBe(BLOCK)
        expect(warnings).toHaveLength(1)
    })

    it('keeps the blocks and warns once when no renderer is registered', async () => {
        MU.diagramRenderers = undefined
        const warnings = []
        const html = `${BLOCK}<p>x</p>${BLOCK}`
        expect(await embedDiagrams(html, warnings, { format: 'svg' })).toBe(html)
        expect(warnings).toEqual(['Mermaid diagrams were left as code blocks because the Mermaid plugin is not installed'])
    })

    it('renders each diagram separately and recovers per block', async () => {
        render.mockRejectedValueOnce(new Error('bad')).mockResolvedValueOnce(SVG)
        const warnings = []
        const html = await embedDiagrams(`${BLOCK}${BLOCK}`, warnings, { format: 'svg' })
        expect(html.startsWith(BLOCK)).toBe(true)
        expect(html).toContain('<img ')
        expect(warnings).toHaveLength(1)
    })
})
