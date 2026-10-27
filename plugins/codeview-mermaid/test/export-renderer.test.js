import { describe, it, expect, vi, afterEach } from 'vitest'
import mermaid from 'mermaid'
import { MU } from 'markupeditor'
import { mermaidPlugin, exportDirective } from '../src/mermaidplugin.js'

afterEach(() => vi.restoreAllMocks())

describe('exportDirective', () => {
  it('always selects the light theme', () => {
    expect(JSON.parse(exportDirective(false).match(/%%\{init: (.*)\}%%/)[1]).theme).toBe('default')
  })

  it('asks for plain text labels only when requested', () => {
    const init = (plain) => JSON.parse(exportDirective(plain).match(/%%\{init: (.*)\}%%/)[1])
    expect(init(true).htmlLabels).toBe(false)
    expect(init(true).flowchart.htmlLabels).toBe(false)
    expect(init(false).htmlLabels).toBeUndefined()
  })
})

describe('renderForExport', () => {
  it('renders the source under the light-theme directive and returns the SVG', async () => {
    const render = vi.spyOn(mermaid, 'render').mockResolvedValue({ svg: '<svg/>' })
    expect(await mermaidPlugin.renderForExport('graph TD\n A-->B', { plainLabels: true })).toBe('<svg/>')
    const [id, text] = render.mock.calls[0]
    expect(id).toMatch(/^mermaid-export-\d+$/)
    expect(text).toBe(`${exportDirective(true)}\ngraph TD\n A-->B`)
  })

  it('gives each render its own element id', async () => {
    const render = vi.spyOn(mermaid, 'render').mockResolvedValue({ svg: '<svg/>' })
    await mermaidPlugin.renderForExport('a')
    await mermaidPlugin.renderForExport('b')
    expect(render.mock.calls[0][0]).not.toBe(render.mock.calls[1][0])
  })

  it('lets a render failure propagate', async () => {
    vi.spyOn(mermaid, 'render').mockRejectedValue(new Error('Parse error'))
    await expect(mermaidPlugin.renderForExport('nope')).rejects.toThrow('Parse error')
  })
})

describe('diagram renderer registration', () => {
  it('registers a mermaid renderer on MU for the exporters', async () => {
    const render = vi.spyOn(mermaid, 'render').mockResolvedValue({ svg: '<svg/>' })
    expect(typeof MU.diagramRenderers?.mermaid).toBe('function')
    expect(await MU.diagramRenderers.mermaid('x', { plainLabels: false })).toBe('<svg/>')
    expect(render).toHaveBeenCalled()
  })
})
