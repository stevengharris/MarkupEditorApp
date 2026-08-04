import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Schema, EditorState, EditorView, MU, Selection } from 'markupeditor'
import { joinBackward } from 'prosemirror-commands'
import { MermaidView, isMermaidLanguage } from '../src/mermaidview.js'
import { mermaidPlugin } from '../src/mermaidplugin.js'

// MarkupEditorApp-1qfq.4/.5: integration coverage for the keyboard/clipboard/
// theme plugin against the REAL wiring shape (MermaidView + createMermaidPlugin),
// replacing the deleted decoration-era markupeditor-mermaid.test.js. Doesn't
// exercise the top-level `if (view) {...}` module-load wiring itself (keyed to
// MU.activeView(), an import-time side effect not practical to unit-test in
// isolation) — hand-wires the same factory shape instead, matching
// mermaidview.test.js's own approach.

const schema = new Schema({
  nodes: {
    doc: { content: 'block+' },
    paragraph: { content: 'text*', group: 'block', toDOM: () => ['p', 0], parseDOM: [{ tag: 'p' }] },
    code_block: {
      content: 'text*', group: 'block', code: true,
      attrs: { language: { default: null } },
      toDOM: () => ['pre', ['code', 0]], parseDOM: [{ tag: 'pre' }]
    },
    text: {}
  }
})

function settleAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve))
}

function mountView(doc, { render } = {}) {
  const nodeViews = {
    code_block: (node, view, getPos) => {
      if (isMermaidLanguage(node.attrs.language)) return new MermaidView(node, view, getPos, null, { render })
      return new MU.CodeView(node, view, getPos, null)
    }
  }
  const plugin = mermaidPlugin.createPlugin()
  const state = EditorState.create({ schema, doc, plugins: [plugin] })
  const container = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(container, { state, nodeViews })
  return {
    view,
    plugin,
    teardown: async () => {
      await settleAnimationFrame()
      view.destroy()
      container.remove()
    }
  }
}

function keyEvent(key) {
  return { key, shiftKey: false, metaKey: false, altKey: false, ctrlKey: false, preventDefault() {} }
}

async function mermaidDoc(text = 'graph TD; A-->B;') {
  return schema.node('doc', null, [
    schema.node('paragraph', null, schema.text('hello')),
    schema.node('code_block', { language: 'mermaid' }, schema.text(text))
  ])
}

describe('arrow-key atomic hop around a Diagram-mode block', () => {
  it('ArrowRight from just before the block lands on its canonical position, ArrowRight again jumps past it', async () => {
    const doc = await mermaidDoc()
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, plugin, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize // start of the code_block
    // End of the leading paragraph's text (position 6, one before blockPos)
    // — NOT Selection.near(resolve(blockPos)), which already lands INSIDE
    // the code_block (the nearest valid text position at that boundary),
    // skipping past the "entering from outside" branch this test means to
    // exercise first.
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos - 1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    expect(view.state.selection.from).toBe(blockPos + 1)

    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    // The code_block is the doc's last node — Selection.near falls back to
    // the nearest valid content position (one before the doc's raw end),
    // not doc.content.size itself, which isn't a valid TextSelection point.
    expect(view.state.selection.from).toBe(view.state.doc.content.size - 1)

    await teardown()
  })

  it('does not intercept arrow keys around a Source-mode block', async () => {
    const doc = await mermaidDoc()
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, plugin, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize
    const instance = view.nodeDOM(blockPos).codeView
    instance.setMode(true) // Source

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos))))
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(false)

    await teardown()
  })
})

describe('Delete/Backspace whole-block deletion around a Diagram-mode block', () => {
  it('Backspace immediately after the block deletes it atomically', async () => {
    const doc = await mermaidDoc()
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, plugin, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const endPos = view.state.doc.content.size
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(endPos))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
    expect(view.state.doc.childCount).toBe(1) // only the leading paragraph remains

    await teardown()
  })

  it('Backspace inside the block\'s own (collapsed) content deletes it atomically', async () => {
    const doc = await mermaidDoc()
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, plugin, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
    expect(view.state.doc.childCount).toBe(1)

    await teardown()
  })
})

// Real bug found in manual verification: a Diagram-mode mermaid block
// followed by an ORDINARY code_block used to be destroyed wholesale by
// Backspace at the start of that following block, because
// handleDiagramDeleteKey's "adjacent" branch only checked the PRECEDING
// (diagram) side, never the block the cursor is actually in. It must defer
// (return false) whenever the cursor's own block is also a code_block, so
// the normal join-with-previous/delete-if-empty keymap behavior can run
// instead -- that behavior already keeps the surviving block's own
// language (mermaid or otherwise), verified separately in markupeditor-base.
describe('deferring to normal join/delete-if-empty when the cursor is in a code_block, not atomically deleting the adjacent diagram', () => {
    it('Backspace at the start of a non-empty code_block after a Diagram-mode block defers, and the deferred join keeps the diagram\'s own language', async () => {
        const doc = schema.node('doc', null, [
            schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B;')),
            schema.node('code_block', { language: null }, schema.text('Hello')),
        ])
        const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
        const { view, plugin, teardown } = mountView(doc, { render })
        await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

        const secondBlockStart = doc.child(0).nodeSize
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(secondBlockStart + 1))))

        expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(false)
        expect(view.state.doc.childCount).toBe(2) // untouched -- no transaction was dispatched by this handler

        expect(joinBackward(view.state, view.dispatch)).toBe(true)
        expect(view.state.doc.childCount).toBe(1)
        expect(view.state.doc.firstChild.attrs.language).toBe('mermaid')
        expect(view.state.doc.firstChild.textContent).toBe('graph TD; A-->B;Hello')

        await teardown()
    })

    it('Backspace at the start of an EMPTY code_block after a Diagram-mode block defers, and the deferred delete lands the cursor in the diagram block unchanged', async () => {
        const doc = schema.node('doc', null, [
            schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B;')),
            schema.node('code_block', { language: null }),
        ])
        const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
        const { view, plugin, teardown } = mountView(doc, { render })
        await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

        const secondBlockStart = doc.child(0).nodeSize
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(secondBlockStart + 1))))

        expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(false)

        expect(joinBackward(view.state, view.dispatch)).toBe(true)
        expect(view.state.doc.childCount).toBe(1)
        expect(view.state.doc.firstChild.attrs.language).toBe('mermaid')
        expect(view.state.doc.firstChild.textContent).toBe('graph TD; A-->B;')

        await teardown()
    })

    it('Delete at the end of a non-empty code_block before a Diagram-mode block also defers (the forward-direction mirror)', async () => {
        const doc = schema.node('doc', null, [
            schema.node('code_block', { language: null }, schema.text('Hello')),
            schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B;')),
        ])
        const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
        const { view, plugin, teardown } = mountView(doc, { render })
        await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

        const firstBlockEnd = doc.child(0).nodeSize - 1 // end of "Hello"'s own text
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(firstBlockEnd))))

        expect(plugin.props.handleKeyDown(view, keyEvent('Delete'))).toBe(false)
        expect(view.state.doc.childCount).toBe(2) // untouched -- no transaction was dispatched by this handler

        await teardown()
    })

    it('Backspace at the start of a PARAGRAPH (not a code_block) after a Diagram-mode block still deletes it atomically -- unchanged, regression guard', async () => {
        const doc = schema.node('doc', null, [
            schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B;')),
            schema.node('paragraph', null, schema.text('world')),
        ])
        const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
        const { view, plugin, teardown } = mountView(doc, { render })
        await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

        const secondBlockStart = doc.child(0).nodeSize
        view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(secondBlockStart + 1))))

        expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
        expect(view.state.doc.childCount).toBe(1)
        expect(view.state.doc.firstChild.type.name).toBe('paragraph')

        await teardown()
    })
})

describe('copy/cut/paste of a selected Diagram-mode block', () => {
  function fakeClipboardEvent() {
    const data = new Map()
    return {
      clipboardData: {
        clearData: () => data.clear(),
        setData: (type, value) => data.set(type, value),
        getData: (type) => data.get(type) ?? '',
        get: (type) => data.get(type)
      },
      preventDefault() {}
    }
  }

  it('copy writes the whole block to the clipboard and does not modify the document', async () => {
    const doc = await mermaidDoc()
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, plugin, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))
    const docBefore = view.state.doc

    const event = fakeClipboardEvent()
    plugin.props.handleDOMEvents.copy(view, event)
    expect(event.clipboardData.getData('text/plain')).toContain('graph TD')
    expect(view.state.doc).toBe(docBefore)

    await teardown()
  })

  it('cut writes the block to the clipboard and removes it from the document', async () => {
    const doc = await mermaidDoc()
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, plugin, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))

    const event = fakeClipboardEvent()
    plugin.props.handleDOMEvents.cut(view, event)
    expect(event.clipboardData.getData('text/plain')).toContain('graph TD')
    expect(view.state.doc.childCount).toBe(1)

    await teardown()
  })

  it('paste with the block selected replaces its whole content, not a splice at the cursor', async () => {
    const doc = await mermaidDoc()
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, plugin, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))

    const event = fakeClipboardEvent()
    event.clipboardData.setData('text/plain', 'pie title new diagram')
    plugin.props.handleDOMEvents.paste(view, event)

    expect(view.state.doc.child(1).textContent).toBe('pie title new diagram')

    await teardown()
  })
})

describe('caret-hide class', () => {
  it('applies to the editor root only while selection is inside a Diagram-mode block', async () => {
    const doc = await mermaidDoc()
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))
    expect(view.dom.classList.contains('mermaid-hide-caret')).toBe(true)

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0))))
    expect(view.dom.classList.contains('mermaid-hide-caret')).toBe(false)

    await teardown()
  })
})

describe('OS theme change', () => {
  it('re-renders every live Diagram-mode instance', async () => {
    const doc = await mermaidDoc()
    let call = 0
    const render = vi.fn().mockImplementation(() => Promise.resolve({ svg: `<svg>v${++call}</svg>` }))
    let changeListener
    const originalMatchMedia = window.matchMedia
    window.matchMedia = () => ({
      matches: false,
      addEventListener: (type, cb) => { if (type === 'change') changeListener = cb },
      removeEventListener: () => {}
    })
    const nodeViews = {
      code_block: (node, view, getPos) => {
        if (isMermaidLanguage(node.attrs.language)) return new MermaidView(node, view, getPos, null, { render })
        return new MU.CodeView(node, view, getPos, null)
      }
    }
    const plugin = mermaidPlugin.createPlugin()
    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews })
    try {
      await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

      render.mockClear()
      changeListener({ matches: true })
      await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

      await settleAnimationFrame()
    } finally {
      view.destroy()
      container.remove()
      window.matchMedia = originalMatchMedia
    }
  })
})

// Mirrors the ACTUAL capture-wrap-delegate pattern markupeditor-mermaid.js's
// own top-level wiring uses (view.props.nodeViews.code_block captured, then
// wrapped) — mountView's helper above hand-picks MermaidView vs CodeView
// directly, which doesn't exercise the delegation-to-whatever-was-already-
// installed path at all.
describe('a mermaid block coexisting with a non-mermaid one, via the real capture-and-wrap factory pattern', () => {
  it('routes each block to the right NodeView and arrow-key navigation crosses both correctly', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B;')),
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const wrappedFactory = (node, view, getPos) => {
      if (isMermaidLanguage(node.attrs.language)) return new MermaidView(node, view, getPos, null, { render })
      return originalFactory(node, view, getPos)
    }
    const plugin = mermaidPlugin.createPlugin()
    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: wrappedFactory } })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const mermaidPos = 0
    const jsPos = doc.child(0).nodeSize
    expect(view.nodeDOM(mermaidPos).codeView).toBeInstanceOf(MermaidView)
    expect(view.nodeDOM(jsPos).codeView).toBeInstanceOf(MU.CodeView)
    expect(view.nodeDOM(jsPos).codeView).not.toBeInstanceOf(MermaidView)

    // The doc starts right with the mermaid block, so the default selection
    // already lands INSIDE it (position 1) — one ArrowRight is the
    // "already inside -> hop out" case, landing somewhere inside the plain
    // code_block right after it. A second ArrowRight is then ordinary text
    // navigation there (not intercepted), confirming the plain block isn't
    // mistaken for a Diagram-mode one.
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0))))
    expect(view.state.selection.from).toBe(mermaidPos + 1)
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    const landedIn = view.state.selection.$from
    expect(landedIn.parent.type.name).toBe('code_block')
    expect(landedIn.parent.attrs.language).toBe('javascript')
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(false)

    await settleAnimationFrame()
    view.destroy()
    container.remove()
  })
})

// Real bug found in manual verification (MarkupEditorApp-1qfq.7): the
// reverse direction of mermaidview.test.js's "language changed away from
// mermaid" fix — a PLAIN code_block whose language changes TO mermaid via
// the dialog didn't upgrade, because the instance already in place (a
// MU.CodeView, or whatever another plugin's delegate chain produced) has no
// reason to know about mermaid. makeCodeBlockFactory wraps the delegate
// instance's own update() to catch this, without touching CodeView itself.
describe('makeCodeBlockFactory: language changed TO mermaid via the Language dialog', () => {
  it('a plain code_block upgrades to MermaidView once its language becomes mermaid', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    // Fake render: the upgraded MermaidView immediately attempts one against
    // 'const x = 1;' (not valid mermaid) — without this, that hits the REAL
    // mermaid.render + MU.reportError (which dispatches a DOM event on an
    // element that doesn't exist in this jsdom test), an unhandled rejection
    // unrelated to what this test actually checks.
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const codeBlockFactory = mermaidPlugin.makeCodeBlockFactory(originalFactory, null, { render })
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: codeBlockFactory } })

    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(MermaidView)

    view.dispatch(view.state.tr.setNodeAttribute(0, 'language', 'mermaid'))

    expect(view.nodeDOM(0).codeView).toBeInstanceOf(MermaidView)
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    view.destroy()
    container.remove()
  })

  it('an ordinary content edit on a plain code_block still works normally after being wrapped', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const codeBlockFactory = mermaidPlugin.makeCodeBlockFactory(originalFactory, null)
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: codeBlockFactory } })

    view.dispatch(view.state.tr.insertText('!', 1))
    expect(view.state.doc.firstChild.textContent).toBe('!const x = 1;')
    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(MermaidView)

    view.destroy()
    container.remove()
  })
})

// Real bug found in manual verification (MarkupEditorApp-1qfq.7): on macOS,
// Cmd+V never reaches the DOM as a paste event — NSResponder's paste(_:)
// (MarkupWKWebView.swift) reads NSPasteboard directly and, when the
// selection is inside a <pre>, calls MU.pasteCode(text) via
// executeJavaScript, bypassing handleDOMEvents.paste (and this package's own
// handleDiagramPaste) entirely. MU.pasteCode itself is a plain insertText at
// the current (collapsed) selection, landing pasted text at the very START
// of a Diagram-mode block's content instead of replacing it.
describe('wrapPasteCodeForDiagram: MU.pasteCode, the path native macOS paste actually uses', () => {
  // MU.pasteCode is a real property on the shared MU singleton — save/restore
  // around each test so this doesn't leak into unrelated tests in this file
  // or others sharing the same module registry.
  let originalPasteCode
  beforeEach(() => { originalPasteCode = MU.pasteCode })
  afterEach(() => { MU.pasteCode = originalPasteCode })

  it('replaces the WHOLE content of a selected Diagram-mode block, not a splice at the cursor', async () => {
    const doc = await mermaidDoc('graph TD; A-->B;')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))
    mermaidPlugin.wrapPasteCodeForDiagram(view)

    MU.pasteCode('pie title NETFLIX')

    expect(view.state.doc.lastChild.textContent).toBe('pie title NETFLIX')

    await teardown()
  })

  it('delegates to the original MU.pasteCode for a plain (non-diagram-selected) code_block', async () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const { view, teardown } = mountView(doc, {})
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))
    const spy = vi.fn()
    MU.pasteCode = spy
    mermaidPlugin.wrapPasteCodeForDiagram(view)

    MU.pasteCode('!')

    expect(spy).toHaveBeenCalledWith('!')

    await teardown()
  })

  it('deletes the content entirely when pasted text is empty', async () => {
    const doc = await mermaidDoc('graph TD; A-->B;')
    const render = vi.fn().mockResolvedValue({ svg: '<svg>ok</svg>' })
    const { view, teardown } = mountView(doc, { render })
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1))

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(blockPos + 1))))
    mermaidPlugin.wrapPasteCodeForDiagram(view)

    MU.pasteCode('')

    expect(view.state.doc.lastChild.textContent).toBe('')

    await teardown()
  })
})
