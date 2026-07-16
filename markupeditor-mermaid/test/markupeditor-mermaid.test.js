import { describe, it, expect, vi } from 'vitest'
import { Schema, EditorState } from 'markupeditor'
import { isMermaidLanguage, createMermaidRenderPlugin } from '../src/markupeditor-mermaid.js'

// Minimal schema, not markupeditor-base's full production schema — just enough
// to exercise the plugin's own logic (code_block with a language attr, plus a
// paragraph to make edits "elsewhere in the doc" for cache-survival tests).
const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: {
      content: 'text*', group: 'block',
      toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }]
    },
    code_block: {
      content: 'text*', group: 'block', code: true,
      attrs: { language: { default: null } },
      toDOM: () => ['pre', ['code', 0]], parseDOM: [{ tag: 'pre' }]
    },
    text: {}
  }
})

function codeBlockDoc(text, language) {
  return schema.node('doc', null, [
    schema.node('code_block', { language }, text ? schema.text(text) : undefined)
  ])
}

describe('isMermaidLanguage', () => {
  it('matches case-insensitively and tolerates surrounding whitespace', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true)
    expect(isMermaidLanguage('Mermaid')).toBe(true)
    expect(isMermaidLanguage('MERMAID')).toBe(true)
    expect(isMermaidLanguage('  mermaid  ')).toBe(true)
  })

  it('does not match other languages, null, undefined, or empty string', () => {
    expect(isMermaidLanguage('javascript')).toBe(false)
    expect(isMermaidLanguage(null)).toBe(false)
    expect(isMermaidLanguage(undefined)).toBe(false)
    expect(isMermaidLanguage('')).toBe(false)
  })
})

describe('createMermaidRenderPlugin', () => {
  it('renders a mermaid code_block exactly once and caches the result', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const dispatch = vi.fn()
    const { plugin, renderCache } = createMermaidRenderPlugin({ render, dispatch })

    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    expect(render).toHaveBeenCalledTimes(1)

    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(renderCache.get(state.doc.firstChild)).toEqual({ svg: '<svg>ok</svg>' })
  })

  it('caches a render failure as an error, without throwing', async () => {
    const doc = codeBlockDoc('not valid mermaid', 'mermaid')
    const render = vi.fn().mockRejectedValue(new Error('Parse error on line 1'))
    const dispatch = vi.fn()
    const { plugin, renderCache } = createMermaidRenderPlugin({ render, dispatch })

    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))

    expect(renderCache.get(state.doc.firstChild)).toEqual({ error: 'Parse error on line 1' })
  })

  it('never calls render for a code_block whose language is not mermaid', () => {
    const doc = codeBlockDoc('console.log(1)', 'javascript')
    const render = vi.fn()
    const dispatch = vi.fn()
    const { plugin } = createMermaidRenderPlugin({ render, dispatch })

    EditorState.create({ schema, doc, plugins: [plugin] })

    expect(render).not.toHaveBeenCalled()
  })

  it('does not re-render an unchanged mermaid code_block when an unrelated edit happens elsewhere in the doc', async () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('hello')),
      schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B;'))
    ])
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const dispatch = vi.fn()
    const { plugin, renderCache } = createMermaidRenderPlugin({ render, dispatch })

    let state = EditorState.create({ schema, doc, plugins: [plugin] })
    expect(render).toHaveBeenCalledTimes(1)
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))

    // Simulate the view applying the dispatched meta transaction.
    state = state.apply(state.tr.setMeta('mermaid-rendered', true))
    const cachedNode = state.doc.lastChild
    expect(renderCache.get(cachedNode)).toEqual({ svg: '<svg>ok</svg>' })

    // An edit inside the paragraph, well before the code_block — the
    // code_block subtree is untouched, so ProseMirror's structural sharing
    // means it keeps the same Node object identity.
    state = state.apply(state.tr.insertText('!', 1, 1))

    expect(render).toHaveBeenCalledTimes(1)
    expect(state.doc.lastChild).toBe(cachedNode)
    expect(renderCache.get(state.doc.lastChild)).toEqual({ svg: '<svg>ok</svg>' })
  })

  it('positions the widget at pos + node.nodeSize (sibling after the node), not pos + 1 (inside its content) — regression guard for the P1 spike bug', () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const dispatch = vi.fn()
    const { plugin } = createMermaidRenderPlugin({ render, dispatch })

    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const decorations = plugin.getState(state).find()
    const node = state.doc.firstChild

    // Decoration.node() spans a range; Decoration.widget() is zero-width (from === to).
    const nodeDecoration = decorations.find((d) => d.from === 0 && d.to === node.nodeSize)
    const widgetDecoration = decorations.find((d) => d.from === d.to)

    expect(nodeDecoration).toBeDefined()
    expect(widgetDecoration).toBeDefined()
    expect(widgetDecoration.from).toBe(node.nodeSize)
    expect(widgetDecoration.from).not.toBe(1) // the P1-fixed bug's position, inside the node's content
  })

  it('holds a pending marker (what renders as the placeholder) synchronously, before the async render resolves', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    let resolveRender
    const render = vi.fn(() => new Promise((resolve) => { resolveRender = resolve }))
    const dispatch = vi.fn()
    const { plugin, renderCache } = createMermaidRenderPlugin({ render, dispatch })

    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const node = state.doc.firstChild

    expect(renderCache.get(node)).toMatchObject({ pending: true })
    expect(dispatch).not.toHaveBeenCalled()

    resolveRender({ svg: '<svg>ok</svg>' })
    await vi.waitFor(() => expect(dispatch).toHaveBeenCalledTimes(1))
    expect(renderCache.get(node)).toEqual({ svg: '<svg>ok</svg>' })
  })

  it('treats a synchronously-throwing render the same as a rejection, without crashing', () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn(() => { throw new Error('boom') })
    const dispatch = vi.fn()
    const { plugin, renderCache } = createMermaidRenderPlugin({ render, dispatch })

    expect(() => EditorState.create({ schema, doc, plugins: [plugin] })).not.toThrow()
    expect(renderCache.get(doc.firstChild)).toEqual({ error: 'boom' })
    expect(dispatch).toHaveBeenCalledTimes(1)
  })

  it('reconfigure attaches the plugin without dropping existing plugins', () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const dispatch = vi.fn()
    const { plugin } = createMermaidRenderPlugin({ render, dispatch })

    let state = EditorState.create({ schema, doc, plugins: [] })
    const beforeCount = state.plugins.length

    state = state.reconfigure({ plugins: [...state.plugins, plugin] })

    expect(state.plugins.length).toBe(beforeCount + 1)
    expect(state.plugins).toContain(plugin)
  })
})
