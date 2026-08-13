import { describe, it, expect, vi } from 'vitest'
import { Schema, EditorState, EditorView, MU } from 'markupeditor'
import { MermaidView, isMermaidLanguage } from '../src/mermaidview.js'

// MermaidView unit coverage in isolation, via a hand-wired nodeViews factory
// — NOT through markupeditor-mermaid.js's real entry-point wiring
// (view.setProps + the language-aware factory override), which
// mermaid-plugin.test.js covers instead. Broader integration coverage
// (arrow-key/delete/copy/paste atomic-hop, the OS theme listener actually
// firing forceRerenderAll, multiple mermaid blocks via the real factory)
// also lives there.

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

function settleAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function mountView(doc, { render, reportError } = {}) {
  const nodeViews = {
    code_block: (node, view, getPos) => {
      if (isMermaidLanguage(node.attrs.language)) {
        return new MermaidView(node, view, getPos, null, { render, reportError })
      }
      return new MU.CodeView(node, view, getPos, null)
    }
  }
  const state = EditorState.create({ schema, doc })
  const container = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(container, { state, nodeViews })
  return {
    view,
    teardown: async () => {
      await settleAnimationFrame()
      view.destroy()
      container.remove()
    }
  }
}

describe('MermaidView defaults', () => {
  it('a non-empty mermaid block attempts Diagram by default and paints the resolved SVG', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })

    const instance = view.nodeDOM(0).codeView
    expect(instance).toBeInstanceOf(MermaidView)
    expect(instance.mode).toBe('diagram')
    expect(instance.diagramContainer.className).toBe('mermaid-placeholder')
    expect(instance.diagramContainer.textContent).toBe('Rendering…')

    await vi.waitFor(() => expect(instance.diagramContainer.className).toBe('mermaid-diagram'))
    expect(instance.diagramContainer.innerHTML).toBe('<svg>ok</svg>')
    expect(render).toHaveBeenCalledTimes(1)

    await teardown()
  })

  it('an empty mermaid block stays on Source and never attempts a render', async () => {
    const doc = codeBlockDoc('', 'mermaid')
    const render = vi.fn()
    const { view, teardown } = mountView(doc, { render })

    const instance = view.nodeDOM(0).codeView
    expect(instance.mode).toBe('source')
    expect(render).not.toHaveBeenCalled()
    expect(instance.diagramContainer.isConnected).toBe(false)

    await teardown()
  })
})

describe('tab click / mode switching', () => {
  it('toggles mode synchronously (no transaction, no waiting on the render promise) and is a no-op on the already-active tab', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    instance.setActive(true)

    expect(instance.mode).toBe('diagram')
    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.mode).toBe('source') // synchronous, before the render promise ever settles
    expect(instance.sourceTab.classList.contains('mermaid-mode-toggle-active')).toBe(true)
    expect(instance.diagramTab.classList.contains('mermaid-mode-toggle-active')).toBe(false)

    // Clicking the already-active Source tab again: explicit SET semantics,
    // not a toggle — must stay on Source, not flip back to Diagram.
    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.mode).toBe('source')

    await teardown()
  })

  it('appends the diagram box on switch to Diagram and removes it on switch to Source', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    instance.setActive(true)
    // classList.contains, not an exact className match — selected AND in
    // Diagram mode also carries mermaid-diagram-selected (paintDiagram no
    // longer clobbers it, see the class-clobbering fix).
    await vi.waitFor(() => expect(instance.diagramContainer.classList.contains('mermaid-diagram')).toBe(true))
    expect(instance.diagramContainer.classList.contains('mermaid-diagram-selected')).toBe(true)
    expect(instance.diagramContainer.isConnected).toBe(true)
    expect(instance.contentDOM.classList.contains('mermaid-hidden-code')).toBe(true)

    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.diagramContainer.isConnected).toBe(false)
    expect(instance.contentDOM.classList.contains('mermaid-hidden-code')).toBe(false)

    await teardown()
  })
})

describe('selection-gated tab/dom visibility', () => {
  it('Source/Diagram tabs are only DOM children of dom while active', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    expect(instance.sourceTab.isConnected).toBe(false)
    expect(instance.diagramTab.isConnected).toBe(false)

    instance.setActive(true)
    expect(instance.sourceTab.isConnected).toBe(true)
    expect(instance.diagramTab.isConnected).toBe(true)

    instance.setActive(false)
    expect(instance.sourceTab.isConnected).toBe(false)
    expect(instance.diagramTab.isConnected).toBe(false)

    await teardown()
  })

  it('attaches below the block when there is no room above, matching the Language tab\'s own behavior', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    instance.dom.getBoundingClientRect = () => ({ top: 0, bottom: 20, left: 0, right: 0, width: 0, height: 20, x: 0, y: 0, toJSON() { return this } })
    instance.setActive(true)

    expect(instance.sourceTab.classList.contains('mermaid-mode-toggle-below')).toBe(true)
    expect(instance.diagramTab.classList.contains('mermaid-mode-toggle-below')).toBe(true)

    await teardown()
  })
})

describe('render caching on edit', () => {
  it('editing while Diagram is showing re-renders with the fresh text', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>v1</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    render.mockResolvedValue({ svg: '<svg>v2</svg>' })
    view.dispatch(view.state.tr.insertText('X', 1))

    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2))
    expect(render.mock.calls[1][1]).toBe('Xgraph TD; A-->B;')
    await vi.waitFor(() => expect(instance.diagramContainer.innerHTML).toBe('<svg>v2</svg>'))

    await teardown()
  })

  it('editing while Source is showing does not re-render', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))
    instance.setMode(true) // Source
    expect(render).toHaveBeenCalledTimes(1)

    view.dispatch(view.state.tr.insertText('X', 1))
    expect(instance.mode).toBe('source')
    expect(render).toHaveBeenCalledTimes(1) // still not re-triggered

    // Switching back to Diagram now picks up the edited text.
    instance.setMode(false)
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2))
    expect(render.mock.calls[1][1]).toBe('Xgraph TD; A-->B;')

    await teardown()
  })

  it('does not re-render unchanged content when switching modes back and forth', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    instance.setMode(true)
    instance.setMode(false)
    expect(render).toHaveBeenCalledTimes(1) // cache still valid, no new attempt

    await teardown()
  })
})

describe('render error handling', () => {
  it('falls back to Source automatically on a rejected render, and reports the error exactly once', async () => {
    const doc = codeBlockDoc('not valid mermaid', 'mermaid')
    const render = vi.fn().mockRejectedValue(new Error('Parse error on line 1'))
    const reportError = vi.fn()
    const { view, teardown } = mountView(doc, { render, reportError })
    const instance = view.nodeDOM(0).codeView

    await vi.waitFor(() => expect(instance.mode).toBe('source'))
    expect(reportError).toHaveBeenCalledTimes(1)
    expect(reportError).toHaveBeenCalledWith('MermaidRenderError', 'Parse error on line 1', 'not valid mermaid', true)

    // Re-entering Diagram without an edit in between (e.g. clicking the
    // Diagram tab again) must bounce straight back to Source, synchronously
    // — not get stuck showing a bogus "Rendering…" placeholder forever
    // (paintDiagram only distinguishes svg vs not-yet-resolved, not svg vs
    // failed) — and must not re-report the same cached failure.
    instance.setMode(false)
    expect(instance.mode).toBe('source')
    expect(instance.diagramContainer.isConnected).toBe(false)
    await settleAnimationFrame()
    expect(reportError).toHaveBeenCalledTimes(1)

    await teardown()
  })

  it('a synchronously-throwing render is handled the same way as a rejected promise', async () => {
    const doc = codeBlockDoc('bad', 'mermaid')
    const render = vi.fn(() => { throw new Error('sync failure') })
    const reportError = vi.fn()
    const { view, teardown } = mountView(doc, { render, reportError })
    const instance = view.nodeDOM(0).codeView

    await vi.waitFor(() => expect(instance.mode).toBe('source'))
    expect(reportError).toHaveBeenCalledWith('MermaidRenderError', 'sync failure', 'bad', true)

    await teardown()
  })
})

describe('theme-change re-render (MermaidView.forceRerenderAll)', () => {
  it('re-renders only instances currently showing Diagram; a Source-mode instance is left alone but its cache is cleared', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'mermaid' }, schema.text('graph A')),
      schema.node('code_block', { language: 'mermaid' }, schema.text('graph B'))
    ])
    let call = 0
    const render = vi.fn().mockImplementation(() => Promise.resolve({ svg: `<svg>v${++call}</svg>` }))
    const { view, teardown } = mountView(doc, { render })

    const posA = 0
    const posB = doc.child(0).nodeSize
    const a = view.nodeDOM(posA).codeView
    const b = view.nodeDOM(posB).codeView
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2))
    b.setMode(true) // Source

    render.mockClear()
    MermaidView.forceRerenderAll()

    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1)) // only `a`, still in Diagram
    expect(render.mock.calls[0][1]).toBe('graph A')

    // `b`'s cache was invalidated even though it wasn't re-rendered — a
    // later switch back to Diagram picks up a fresh render, not a stale hit.
    b.setMode(false)
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(2))
    expect(render.mock.calls[1][1]).toBe('graph B')

    await teardown()
  })
})

// markupeditor-base's own emptyCodeBlockPlaceholderPlugin (a decoration-era
// "never truly empty" workaround) was removed entirely in commit e09d649
// once CodeView's own tab proved safe without it (verified there by a real
// caret-placement test, test/codeview.test.js). It no longer exists in
// markupeditor-base at all, so there is nothing left for mermaid to rely on
// — this closes that question for MermaidView the same way.
describe('empty block: native caret placement with no separator workaround', () => {
  it('a genuinely empty mermaid block, tabs active, gets correct native caret placement and stays typeable', async () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('hello')),
      schema.node('code_block', { language: 'mermaid' }, undefined)
    ])
    const render = vi.fn()
    const { view, teardown } = mountView(doc, { render })

    const blockPos = doc.child(0).nodeSize
    const instance = view.nodeDOM(blockPos).codeView
    instance.setActive(true)
    view.focus()
    view.dispatch(view.state.tr.setSelection(view.state.selection.constructor.near(view.state.doc.resolve(blockPos + 1))))

    const domSel = view.root.getSelection()
    expect(domSel.focusNode?.nodeName).toBe('CODE')
    expect(domSel.focusOffset).toBe(0)
    expect(instance.contentDOM.innerHTML).toBe('<br class="ProseMirror-trailingBreak">')
    expect(view.dom.querySelector('.ProseMirror-separator')).toBeNull()

    view.dispatch(view.state.tr.insertText('x', view.state.selection.from))
    expect(view.state.doc.lastChild.textContent).toBe('x')
    expect(render).not.toHaveBeenCalled() // still never attempted while empty

    await teardown()
  })
})

// Real bug found in manual verification: the
// Language dialog can change node.attrs.language on the SAME node identity
// without ProseMirror rebuilding the NodeView on its own (it calls
// update() on the existing instance instead) — MermaidView kept its
// Source/Diagram tabs and diagram box forever after language was cleared,
// since update() always returned true regardless of what language became.
describe('language changed away from mermaid via the Language dialog', () => {
  it('the NodeView is rebuilt as a plain CodeView, with no Source/Diagram tabs and no diagram box left over', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = 0
    const before = view.nodeDOM(blockPos).codeView
    before.setActive(true)
    expect(before).toBeInstanceOf(MermaidView)

    view.dispatch(view.state.tr.setNodeAttribute(blockPos, 'language', null))

    const after = view.nodeDOM(blockPos).codeView
    expect(after).not.toBeInstanceOf(MermaidView)
    expect(after).toBeInstanceOf(MU.CodeView)
    expect(after.dom.querySelector('.mermaid-mode-toggle')).toBeNull()
    expect(after.dom.querySelector('.mermaid-diagram')).toBeNull()
    expect(after.dom.querySelector('.mermaid-placeholder')).toBeNull()

    await teardown()
  })

  it('changing language to a different non-empty language also rebuilds away from MermaidView', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    view.dispatch(view.state.tr.setNodeAttribute(0, 'language', 'javascript'))

    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(MermaidView)

    await teardown()
  })
})

// Real bug found in manual verification: create an
// empty mermaid block (selected, so setActive(true) already ran once while
// it was still empty/Source), paste real diagram source into it, switch to
// Diagram — the diagram rendered but showed no selection border.
// codeLanguageOverlayPlugin (markupeditor-base) only calls setActive when
// the SELECTED INSTANCE itself changes; staying selected inside the same
// block the whole time means setActive is never called again, so a mode
// change that happens afterward had nothing re-deriving the border class
// from the CURRENT mode — it was permanently stuck at whatever this.mode
// was the one time setActive(true) actually ran.
describe('selection border stays correct across a mode change without setActive being re-called', () => {
  it('pasting content into an empty, already-selected block then switching to Diagram shows the selected border', async () => {
    const doc = codeBlockDoc('', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView

    instance.setActive(true) // selected while still empty/Source
    expect(instance.diagramContainer.classList.contains('mermaid-diagram-selected')).toBe(false)

    // Paste-equivalent: insert real content without ever calling setActive
    // again (matching codeLanguageOverlayPlugin's own same-instance skip).
    view.dispatch(view.state.tr.insertText('graph TD; A-->B;', 1))
    instance.setMode(false) // user clicks Diagram
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    expect(instance.mode).toBe('diagram')
    expect(instance.isActive).toBe(true)
    expect(instance.diagramContainer.classList.contains('mermaid-diagram-selected')).toBe(true)

    await teardown()
  })

  it('the border is removed on deselect and does not come back until reselected', async () => {
    const doc = codeBlockDoc('graph TD; A-->B;', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    instance.setActive(true)
    expect(instance.diagramContainer.classList.contains('mermaid-diagram-selected')).toBe(true)

    instance.setActive(false)
    expect(instance.diagramContainer.classList.contains('mermaid-diagram-selected')).toBe(false)

    await teardown()
  })
})

// Real bug found in manual verification: replacing
// the whole content of an already-Diagram-mode block (matching what
// wrapPasteCodeForDiagram, markupeditor-mermaid.js, does for a native macOS
// paste) re-renders the diagram correctly but leaves the OLD source text
// visible alongside it. mermaid-hidden-code is only ever (re)applied inside
// syncModeClasses(), called from setMode() -- which never runs here, since
// mode was already 'diagram' before AND after the content change.
describe('content replaced entirely while already in Diagram mode (e.g. paste over a selected diagram)', () => {
  it('the source text stays hidden after the content-replacing transaction, without any setMode call', async () => {
    const doc = codeBlockDoc('pie title old', 'mermaid')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>old</svg>' })
    const { view, teardown } = mountView(doc, { render })
    const instance = view.nodeDOM(0).codeView
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))
    expect(instance.contentDOM.classList.contains('mermaid-hidden-code')).toBe(true)

    render.mockResolvedValue({ svg: '<svg>new</svg>' })
    // Whole-content replace, matching wrapPasteCodeForDiagram's own
    // tr.replaceWith -- NOT setMode, NOT a splice.
    view.dispatch(view.state.tr.replaceWith(1, view.state.doc.firstChild.nodeSize - 1, view.state.schema.text('gitGraph new')))

    expect(instance.mode).toBe('diagram') // unchanged throughout
    expect(instance.contentDOM.classList.contains('mermaid-hidden-code')).toBe(true)
    await vi.waitFor(() => expect(instance.diagramContainer.innerHTML).toBe('<svg>new</svg>'))

    await teardown()
  })
})
