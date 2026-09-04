import { describe, it, expect, vi } from 'vitest'
import { Schema, EditorState, EditorView, MU } from 'markupeditor'
import { HTMLFrontMatterView, isHTMLFrontMatterLanguage } from '../src/htmlfrontmatterview.js'

// HTMLFrontMatterView unit coverage in isolation, via a hand-wired nodeViews
// factory -- NOT through htmlfrontmatterplugin.js's real entry-point wiring
// (view.setProps + the language-and-position-aware factory override, plus
// the Plugin view-update hook driving checkAllPositions()), which
// htmlfrontmatter-plugin.test.js covers instead.

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

function leadingHtmlDoc(text) {
  return schema.node('doc', null, [
    schema.node('code_block', { language: 'html' }, text ? schema.text(text) : undefined)
  ])
}

function mountView(doc, { sanitize, purifyConfig } = {}) {
  const nodeViews = {
    code_block: (node, view, getPos) => {
      if (isHTMLFrontMatterLanguage(node.attrs.language) && getPos() === 0) {
        return new HTMLFrontMatterView(node, view, getPos, null, { sanitize, purifyConfig })
      }
      return new MU.CodeView(node, view, getPos, null)
    }
  }
  const state = EditorState.create({ schema, doc })
  const container = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(container, { state, nodeViews })
  return {
    view,
    teardown: () => {
      view.destroy()
      container.remove()
    }
  }
}

describe('HTMLFrontMatterView defaults', () => {
  it('a non-empty position-0 html block attempts Rendered by default and paints the sanitized content', () => {
    const doc = leadingHtmlDoc('<p align="center"><img src="x.png"></p>')
    const sanitize = vi.fn((html) => html)
    const { view, teardown } = mountView(doc, { sanitize })

    const instance = view.nodeDOM(0).codeView
    expect(instance).toBeInstanceOf(HTMLFrontMatterView)
    expect(instance.mode).toBe('rendered')
    expect(instance.renderedContainer.classList.contains('htmlfrontmatter-rendered')).toBe(true)
    expect(instance.renderedContainer.innerHTML).toBe('<p align="center"><img src="x.png"></p>')
    expect(sanitize).toHaveBeenCalledTimes(1)

    teardown()
  })

  it('an empty html block stays on Source and never attempts to sanitize/render', () => {
    const doc = leadingHtmlDoc('')
    const sanitize = vi.fn()
    const { view, teardown } = mountView(doc, { sanitize })

    const instance = view.nodeDOM(0).codeView
    expect(instance.mode).toBe('source')
    expect(sanitize).not.toHaveBeenCalled()
    expect(instance.renderedContainer.isConnected).toBe(false)

    teardown()
  })
})

describe('tab click / mode switching', () => {
  it('toggles mode synchronously and is a no-op on the already-active tab', () => {
    const doc = leadingHtmlDoc('<b>hi</b>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const instance = view.nodeDOM(0).codeView
    instance.setActive(true)

    expect(instance.mode).toBe('rendered')
    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.mode).toBe('source')
    expect(instance.sourceTab.classList.contains('htmlfrontmatter-mode-toggle-active')).toBe(true)
    expect(instance.renderedTab.classList.contains('htmlfrontmatter-mode-toggle-active')).toBe(false)

    // Explicit SET semantics, not a toggle -- clicking the already-active
    // Source tab again must stay on Source.
    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.mode).toBe('source')

    teardown()
  })

  it('appends the rendered box on switch to Rendered and removes it on switch to Source', () => {
    const doc = leadingHtmlDoc('<b>hi</b>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const instance = view.nodeDOM(0).codeView
    instance.setActive(true)

    expect(instance.renderedContainer.classList.contains('htmlfrontmatter-rendered')).toBe(true)
    expect(instance.renderedContainer.classList.contains('htmlfrontmatter-rendered-selected')).toBe(true)
    expect(instance.renderedContainer.isConnected).toBe(true)
    expect(instance.contentDOM.classList.contains('htmlfrontmatter-hidden-code')).toBe(true)

    instance.sourceTab.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))
    expect(instance.renderedContainer.isConnected).toBe(false)
    expect(instance.contentDOM.classList.contains('htmlfrontmatter-hidden-code')).toBe(false)

    teardown()
  })
})

describe('selection-gated tab/dom visibility', () => {
  it('Source/Rendered tabs are only DOM children of dom while active', () => {
    const doc = leadingHtmlDoc('<b>hi</b>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const instance = view.nodeDOM(0).codeView

    expect(instance.sourceTab.isConnected).toBe(false)
    expect(instance.renderedTab.isConnected).toBe(false)

    instance.setActive(true)
    expect(instance.sourceTab.isConnected).toBe(true)
    expect(instance.renderedTab.isConnected).toBe(true)

    instance.setActive(false)
    expect(instance.sourceTab.isConnected).toBe(false)
    expect(instance.renderedTab.isConnected).toBe(false)

    teardown()
  })

  it('attaches below the block when there is no room above, matching the Language tab\'s own behavior', () => {
    const doc = leadingHtmlDoc('<b>hi</b>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const instance = view.nodeDOM(0).codeView

    instance.dom.getBoundingClientRect = () => ({ top: 0, bottom: 20, left: 0, right: 0, width: 0, height: 20, x: 0, y: 0, toJSON() { return this } })
    instance.setActive(true)

    expect(instance.sourceTab.classList.contains('htmlfrontmatter-mode-toggle-below')).toBe(true)
    expect(instance.renderedTab.classList.contains('htmlfrontmatter-mode-toggle-below')).toBe(true)

    teardown()
  })
})

describe('render caching on edit', () => {
  it('editing while Rendered is showing re-renders with the fresh text', () => {
    const sanitize = vi.fn((html) => html)
    const doc = leadingHtmlDoc('<p>v1</p>')
    const { view, teardown } = mountView(doc, { sanitize })
    const instance = view.nodeDOM(0).codeView
    expect(sanitize).toHaveBeenCalledTimes(1)

    view.dispatch(view.state.tr.insertText('X', 1))

    expect(sanitize).toHaveBeenCalledTimes(2)
    expect(sanitize.mock.calls[1][0]).toBe('X<p>v1</p>')
    expect(instance.renderedContainer.innerHTML).toBe('X<p>v1</p>')

    teardown()
  })

  it('editing while Source is showing does not re-sanitize/render', () => {
    const sanitize = vi.fn((html) => html)
    const doc = leadingHtmlDoc('<p>v1</p>')
    const { view, teardown } = mountView(doc, { sanitize })
    const instance = view.nodeDOM(0).codeView
    expect(sanitize).toHaveBeenCalledTimes(1)
    instance.setMode(true) // Source
    expect(sanitize).toHaveBeenCalledTimes(1)

    view.dispatch(view.state.tr.insertText('X', 1))
    expect(instance.mode).toBe('source')
    expect(sanitize).toHaveBeenCalledTimes(1) // still not re-triggered

    // Switching back to Rendered now picks up the edited text.
    instance.setMode(false)
    expect(sanitize).toHaveBeenCalledTimes(2)
    expect(sanitize.mock.calls[1][0]).toBe('X<p>v1</p>')

    teardown()
  })

  it('does not re-sanitize unchanged content when switching modes back and forth', () => {
    const sanitize = vi.fn((html) => html)
    const doc = leadingHtmlDoc('<p>v1</p>')
    const { view, teardown } = mountView(doc, { sanitize })
    expect(sanitize).toHaveBeenCalledTimes(1)
    const instance = view.nodeDOM(0).codeView

    instance.setMode(true)
    instance.setMode(false)
    expect(sanitize).toHaveBeenCalledTimes(1) // cache still valid, no new attempt

    teardown()
  })
})

describe('sanitization', () => {
  it('passes content through the injected sanitize function with the configured purifyConfig', () => {
    const sanitize = vi.fn(() => '<p>safe</p>')
    const purifyConfig = { ALLOWED_TAGS: ['p'] }
    const doc = leadingHtmlDoc('<script>alert(1)</script><p>safe</p>')
    const { view, teardown } = mountView(doc, { sanitize, purifyConfig })

    expect(sanitize).toHaveBeenCalledWith('<script>alert(1)</script><p>safe</p>', purifyConfig)
    const instance = view.nodeDOM(0).codeView
    expect(instance.renderedContainer.innerHTML).toBe('<p>safe</p>')

    teardown()
  })

  it('uses the real default-exported DOMPurify.sanitize when no override is injected, stripping a script tag', async () => {
    const { default: DOMPurify } = await import('dompurify')
    const doc = leadingHtmlDoc('<script>alert(1)</script><p>safe</p>')
    const { view, teardown } = mountView(doc, { sanitize: DOMPurify.sanitize })

    const instance = view.nodeDOM(0).codeView
    expect(instance.renderedContainer.innerHTML).not.toContain('<script')
    expect(instance.renderedContainer.innerHTML).toContain('safe')

    teardown()
  })
})

describe('empty block: native caret placement with no separator workaround', () => {
  // Mirrors MermaidView's own test of the same name -- markupeditor-base's
  // emptyCodeBlockPlaceholderPlugin no longer exists (removed once
  // CodeView's own tab proved safe without it), so there is nothing left to
  // rely on for HTMLFrontMatterView either. Not at position 0 here deliberately
  // (a genuinely empty position-0 block stays Source per the "defaults"
  // section above; this exercises the same caret mechanics MermaidView's
  // version does, independent of the position constraint).
  it('a genuinely empty html block, tabs active, gets correct native caret placement and stays typeable', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('hello')),
      schema.node('code_block', { language: 'html' }, undefined)
    ])
    const nodeViews = {
      code_block: (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    }
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews })

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

    view.destroy()
    container.remove()
  })
})

// Real bug found while writing this suite: the Language dialog changes
// node.attrs.language on the SAME node identity without ProseMirror
// rebuilding the NodeView on its own (it calls update() on the existing
// instance) -- HTMLFrontMatterView
// would keep its Source/Rendered tabs and rendered box forever after
// language was cleared, unless update() correctly signals a rebuild.
describe('language changed away from html via the Language dialog', () => {
  it('the NodeView is rebuilt as a plain CodeView, with no Source/Rendered tabs and no rendered box left over', () => {
    const doc = leadingHtmlDoc('<p>hi</p>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const before = view.nodeDOM(0).codeView
    before.setActive(true)
    expect(before).toBeInstanceOf(HTMLFrontMatterView)

    view.dispatch(view.state.tr.setNodeAttribute(0, 'language', null))

    const after = view.nodeDOM(0).codeView
    expect(after).not.toBeInstanceOf(HTMLFrontMatterView)
    expect(after).toBeInstanceOf(MU.CodeView)
    expect(after.dom.querySelector('.htmlfrontmatter-mode-toggle')).toBeNull()
    expect(after.dom.querySelector('.htmlfrontmatter-rendered')).toBeNull()

    teardown()
  })

  it('changing language to a different non-empty language also rebuilds away from HTMLFrontMatterView', () => {
    const doc = leadingHtmlDoc('<p>hi</p>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })

    view.dispatch(view.state.tr.setNodeAttribute(0, 'language', 'javascript'))

    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(HTMLFrontMatterView)

    teardown()
  })
})

describe('position-0 enforcement (checkAllPositions catches a pure position shift that update() cannot)', () => {
  it('checkAllPositions() forces Source-only display once a preceding sibling shifts this block away from position 0', () => {
    const doc = leadingHtmlDoc('<p>hi</p>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const instance = view.nodeDOM(0).codeView
    expect(instance.mode).toBe('rendered')
    expect(instance.positionValid).toBe(true)

    const insertedParagraph = schema.node('paragraph', null, schema.text('inserted first'))
    view.dispatch(view.state.tr.insert(0, insertedParagraph))
    // update() does NOT fire for this pure position shift -- this is the
    // real enforcement call htmlfrontmatterplugin.js's Plugin view-update hook
    // makes on every transaction.
    HTMLFrontMatterView.checkAllPositions()

    expect(instance.positionValid).toBe(false)
    expect(instance.mode).toBe('source')
    expect(instance.dom.contains(instance.renderedTab)).toBe(false)
    expect(instance.destroyed).toBeUndefined() // self-corrected in place, no destroy() call at all

    // One-way: clicking Source again (a no-op, already there) or attempting
    // Rendered directly must not re-enable it.
    instance.setMode(false)
    expect(instance.mode).toBe('source')

    teardown()
  })

  it('an instance that never leaves position 0 is unaffected by checkAllPositions()', () => {
    const doc = leadingHtmlDoc('<p>hi</p>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const instance = view.nodeDOM(0).codeView

    HTMLFrontMatterView.checkAllPositions()

    expect(instance.positionValid).toBe(true)
    expect(instance.mode).toBe('rendered')

    teardown()
  })
})

describe('selection border stays correct across a mode change without setActive being re-called', () => {
  it('pasting content into an empty, already-selected block then switching to Rendered shows the selected border', () => {
    const doc = leadingHtmlDoc('')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const instance = view.nodeDOM(0).codeView

    instance.setActive(true) // selected while still empty/Source
    expect(instance.renderedContainer.classList.contains('htmlfrontmatter-rendered-selected')).toBe(false)

    view.dispatch(view.state.tr.insertText('<b>hi</b>', 1))
    instance.setMode(false) // user clicks Rendered

    expect(instance.mode).toBe('rendered')
    expect(instance.isActive).toBe(true)
    expect(instance.renderedContainer.classList.contains('htmlfrontmatter-rendered-selected')).toBe(true)

    teardown()
  })

  it('the border is removed on deselect and does not come back until reselected', () => {
    const doc = leadingHtmlDoc('<p>hi</p>')
    const { view, teardown } = mountView(doc, { sanitize: (html) => html })
    const instance = view.nodeDOM(0).codeView

    instance.setActive(true)
    expect(instance.renderedContainer.classList.contains('htmlfrontmatter-rendered-selected')).toBe(true)

    instance.setActive(false)
    expect(instance.renderedContainer.classList.contains('htmlfrontmatter-rendered-selected')).toBe(false)

    teardown()
  })
})

describe('content replaced entirely while already in Rendered mode (e.g. paste over a selected block)', () => {
  it('the source text stays hidden after the content-replacing transaction, without any setMode call', () => {
    const sanitize = vi.fn((html) => html)
    const doc = leadingHtmlDoc('<p>old</p>')
    const { view, teardown } = mountView(doc, { sanitize })
    const instance = view.nodeDOM(0).codeView
    expect(sanitize).toHaveBeenCalledTimes(1)
    expect(instance.contentDOM.classList.contains('htmlfrontmatter-hidden-code')).toBe(true)

    view.dispatch(view.state.tr.replaceWith(1, view.state.doc.firstChild.nodeSize - 1, view.state.schema.text('<p>new</p>')))

    expect(instance.mode).toBe('rendered') // unchanged throughout
    expect(instance.contentDOM.classList.contains('htmlfrontmatter-hidden-code')).toBe(true)
    expect(instance.renderedContainer.innerHTML).toBe('<p>new</p>')

    teardown()
  })
})
