import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Schema, EditorState, EditorView, MU, Selection } from 'markupeditor'
import { joinBackward } from 'prosemirror-commands'
import { FrontMatterView, isFrontMatterLanguage } from '../src/frontmatterview.js'
import { frontMatterPlugin } from '../src/frontmatterplugin.js'

// Integration coverage for the keyboard/clipboard plugin against the REAL
// wiring shape (FrontMatterView + FrontMatterPlugin.createPlugin()),
// mirroring mermaid-plugin.test.js. Doesn't exercise the top-level
// `frontMatterPlugin.install()` module-load wiring itself (keyed to
// MU.activeView(), an import-time side effect not practical to unit-test in
// isolation) -- hand-wires the same factory shape instead, matching
// frontmatterview.test.js's own approach.

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

function mountView(doc, { sanitize = (html) => html } = {}) {
  const nodeViews = {
    code_block: (node, view, getPos) => {
      if (isFrontMatterLanguage(node.attrs.language) && getPos() === 0) return new FrontMatterView(node, view, getPos, null, { sanitize })
      return new MU.CodeView(node, view, getPos, null)
    }
  }
  const plugin = frontMatterPlugin.createPlugin()
  const state = EditorState.create({ schema, doc, plugins: [plugin] })
  const container = document.body.appendChild(document.createElement('div'))
  const view = new EditorView(container, { state, nodeViews })
  return {
    view,
    plugin,
    teardown: () => {
      view.destroy()
      container.remove()
    }
  }
}

function keyEvent(key) {
  return { key, shiftKey: false, metaKey: false, altKey: false, ctrlKey: false, preventDefault() {} }
}

function leadingHtmlDoc(text = '<p>preamble</p>') {
  // Deliberately at position 0 -- the constraint this plugin enforces --
  // unlike mermaidDoc's leading paragraph (mermaid has no position
  // constraint to exercise).
  return schema.node('doc', null, [
    schema.node('code_block', { language: 'html' }, schema.text(text)),
    schema.node('paragraph', null, schema.text('body text'))
  ])
}

describe('arrow-key atomic hop around a Rendered-mode block', () => {
  it('ArrowRight from inside the block hops out, landing in the following paragraph', () => {
    const doc = leadingHtmlDoc()
    const { view, plugin, teardown } = mountView(doc)

    // targetPos (blockPos + node.nodeSize) is the boundary right after the
    // code_block's closing tag -- not itself a valid text position, since
    // it sits between two block boundaries. Selection.near resolves to the
    // nearest valid content position, which is one step INSIDE the
    // following paragraph, matching MermaidView's own documented caveat
    // for exactly this "code_block is followed by another block" case.
    const blockEnd = doc.child(0).nodeSize
    const landedPos = blockEnd + 1
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    expect(view.state.selection.from).toBe(landedPos)
    expect(view.state.selection.$from.parent.type.name).toBe('paragraph')

    teardown()
  })

  it('does not intercept arrow keys around a Source-mode block', () => {
    const doc = leadingHtmlDoc()
    const { view, plugin, teardown } = mountView(doc)
    const instance = view.nodeDOM(0).codeView
    instance.setMode(true) // Source

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(false)

    teardown()
  })
})

describe('Delete/Backspace whole-block deletion around a Rendered-mode block', () => {
  it('Delete immediately before the block (position 0) deletes it atomically', () => {
    const doc = leadingHtmlDoc()
    const { view, plugin, teardown } = mountView(doc)

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Delete'))).toBe(true)
    expect(view.state.doc.childCount).toBe(1) // only the trailing paragraph remains
    expect(view.state.doc.firstChild.type.name).toBe('paragraph')

    teardown()
  })

  it('Backspace inside the block\'s own (collapsed) content deletes it atomically', () => {
    const doc = leadingHtmlDoc()
    const { view, plugin, teardown } = mountView(doc)

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
    expect(view.state.doc.childCount).toBe(1)

    teardown()
  })
})

// Mirrors mermaid-plugin.test.js's equivalent describe block: the delete
// handler must defer to normal join/delete-if-empty whenever the cursor's
// OWN block is also a code_block, not just check the adjacent (rendered)
// side.
describe('deferring to normal join/delete-if-empty when the cursor is in a code_block, not atomically deleting the adjacent rendered block', () => {
  it('Backspace at the start of a non-empty code_block after a Rendered-mode block defers, and the deferred join keeps the block\'s own language', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'html' }, schema.text('<p>preamble</p>')),
      schema.node('code_block', { language: null }, schema.text('Hello')),
    ])
    const { view, plugin, teardown } = mountView(doc)

    const secondBlockStart = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(secondBlockStart + 1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(false)
    expect(view.state.doc.childCount).toBe(2) // untouched -- no transaction was dispatched by this handler

    expect(joinBackward(view.state, view.dispatch)).toBe(true)
    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.firstChild.attrs.language).toBe('html')
    expect(view.state.doc.firstChild.textContent).toBe('<p>preamble</p>Hello')

    teardown()
  })

  it('Backspace at the start of a PARAGRAPH (not a code_block) after a Rendered-mode block still deletes it atomically -- regression guard', () => {
    const doc = leadingHtmlDoc()
    const { view, plugin, teardown } = mountView(doc)

    const secondBlockStart = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(secondBlockStart + 1))))

    expect(plugin.props.handleKeyDown(view, keyEvent('Backspace'))).toBe(true)
    expect(view.state.doc.childCount).toBe(1)
    expect(view.state.doc.firstChild.type.name).toBe('paragraph')

    teardown()
  })
})

describe('copy/cut/paste of a selected Rendered-mode block', () => {
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

  it('copy writes the whole block to the clipboard and does not modify the document', () => {
    const doc = leadingHtmlDoc()
    const { view, plugin, teardown } = mountView(doc)
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))
    const docBefore = view.state.doc

    const event = fakeClipboardEvent()
    plugin.props.handleDOMEvents.copy(view, event)
    expect(event.clipboardData.getData('text/plain')).toContain('preamble')
    expect(view.state.doc).toBe(docBefore)

    teardown()
  })

  it('cut writes the block to the clipboard and removes it from the document', () => {
    const doc = leadingHtmlDoc()
    const { view, plugin, teardown } = mountView(doc)
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))

    const event = fakeClipboardEvent()
    plugin.props.handleDOMEvents.cut(view, event)
    expect(event.clipboardData.getData('text/plain')).toContain('preamble')
    expect(view.state.doc.childCount).toBe(1)

    teardown()
  })

  it('paste with the block selected replaces its whole content, not a splice at the cursor', () => {
    const doc = leadingHtmlDoc()
    const { view, plugin, teardown } = mountView(doc)
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))

    const event = fakeClipboardEvent()
    event.clipboardData.setData('text/plain', '<p>new content</p>')
    plugin.props.handleDOMEvents.paste(view, event)

    expect(view.state.doc.firstChild.textContent).toBe('<p>new content</p>')

    teardown()
  })
})

describe('caret-hide class', () => {
  it('applies to the editor root only while selection is inside a Rendered-mode block', () => {
    const doc = leadingHtmlDoc()
    const { view, teardown } = mountView(doc)

    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))
    expect(view.dom.classList.contains('frontmatter-hide-caret')).toBe(true)

    const bodyPos = doc.child(0).nodeSize + 1
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(bodyPos))))
    expect(view.dom.classList.contains('frontmatter-hide-caret')).toBe(false)

    teardown()
  })
})

// Mirrors the ACTUAL capture-wrap-delegate pattern frontmatterplugin.js's
// own top-level wiring uses (view.props.nodeViews.code_block captured, then
// wrapped via makeCodeBlockFactory) -- mountView's helper above hand-picks
// FrontMatterView vs CodeView directly, which doesn't exercise the
// delegation-to-whatever-was-already-installed path at all.
describe('a leading html block coexisting with a non-html one, via the real capture-and-wrap factory pattern', () => {
  it('routes each block to the right NodeView and arrow-key navigation crosses both correctly', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'html' }, schema.text('<p>preamble</p>')),
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const wrappedFactory = frontMatterPlugin.makeCodeBlockFactory(originalFactory, null, { sanitize: (html) => html })
    const plugin = frontMatterPlugin.createPlugin()
    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: wrappedFactory } })

    const htmlPos = 0
    const jsPos = doc.child(0).nodeSize
    expect(view.nodeDOM(htmlPos).codeView).toBeInstanceOf(FrontMatterView)
    expect(view.nodeDOM(jsPos).codeView).toBeInstanceOf(MU.CodeView)
    expect(view.nodeDOM(jsPos).codeView).not.toBeInstanceOf(FrontMatterView)

    // The doc starts right with the html block, so the default selection
    // already lands INSIDE it (position 1) -- one ArrowRight is the
    // "already inside -> hop out" case, landing somewhere inside the plain
    // code_block right after it. A second ArrowRight is then ordinary text
    // navigation there (not intercepted), confirming the plain block isn't
    // mistaken for a Rendered-mode one.
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(0))))
    expect(view.state.selection.from).toBe(htmlPos + 1)
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(true)
    const landedIn = view.state.selection.$from
    expect(landedIn.parent.type.name).toBe('code_block')
    expect(landedIn.parent.attrs.language).toBe('javascript')
    expect(plugin.props.handleKeyDown(view, keyEvent('ArrowRight'))).toBe(false)

    view.destroy()
    container.remove()
  })
})

// Mirrors mermaid-plugin.test.js's "language changed TO mermaid" coverage,
// plus the position-0 check this plugin additionally needs: a plain
// code_block's language changing to html only upgrades to FrontMatterView
// when it's ALSO at position 0.
describe('makeCodeBlockFactory: language changed TO html via the Language dialog', () => {
  it('a plain code_block at position 0 upgrades to FrontMatterView once its language becomes html', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('<p>hi</p>'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const codeBlockFactory = frontMatterPlugin.makeCodeBlockFactory(originalFactory, null, { sanitize: (html) => html })
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: codeBlockFactory } })

    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(FrontMatterView)

    view.dispatch(view.state.tr.setNodeAttribute(0, 'language', 'html'))

    expect(view.nodeDOM(0).codeView).toBeInstanceOf(FrontMatterView)

    view.destroy()
    container.remove()
  })

  it('a plain code_block NOT at position 0 does not upgrade even once its language becomes html', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('leading paragraph')),
      schema.node('code_block', { language: 'javascript' }, schema.text('<p>hi</p>'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const codeBlockFactory = frontMatterPlugin.makeCodeBlockFactory(originalFactory, null, { sanitize: (html) => html })
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: codeBlockFactory } })

    const blockPos = doc.child(0).nodeSize
    view.dispatch(view.state.tr.setNodeAttribute(blockPos, 'language', 'html'))

    expect(view.nodeDOM(blockPos).codeView).not.toBeInstanceOf(FrontMatterView)

    view.destroy()
    container.remove()
  })

  it('an ordinary content edit on a plain code_block still works normally after being wrapped', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const codeBlockFactory = frontMatterPlugin.makeCodeBlockFactory(originalFactory, null)
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: codeBlockFactory } })

    view.dispatch(view.state.tr.insertText('!', 1))
    expect(view.state.doc.firstChild.textContent).toBe('!const x = 1;')
    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(FrontMatterView)

    view.destroy()
    container.remove()
  })
})

// A metadata code_block (markupeditor-codeview-metadata, a sibling plugin) is also a
// leading-position block and takes position 0 when present, shifting the HTML preamble's
// own expected position to right after it -- expectedPreamblePosition is what makes this plugin aware of
// that sequencing rule without a package dependency between the two plugins.
describe('sequencing with a leading metadata block (expectedPreamblePosition)', () => {
  it('an HTML preamble at position 1 activates as FrontMatterView when a metadata block occupies position 0', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'metadata' }, schema.text('title: X')),
      schema.node('code_block', { language: 'html' }, schema.text('<p>preamble</p>')),
      schema.node('paragraph', null, schema.text('body'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const wrappedFactory = frontMatterPlugin.makeCodeBlockFactory(originalFactory, null, { sanitize: (html) => html })
    const plugin = frontMatterPlugin.createPlugin()
    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: wrappedFactory } })

    const preamblePos = doc.child(0).nodeSize
    expect(view.nodeDOM(0).codeView).not.toBeInstanceOf(FrontMatterView) // the metadata block itself
    expect(view.nodeDOM(preamblePos).codeView).toBeInstanceOf(FrontMatterView)
    expect(view.nodeDOM(preamblePos).codeView.mode).toBe('rendered')

    view.destroy()
    container.remove()
  })

  it('an HTML preamble already active at position 0 stays active (not forced to Source) when a metadata block is inserted before it, shifting it to position 1', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'html' }, schema.text('<p>preamble</p>')),
      schema.node('paragraph', null, schema.text('body'))
    ])
    const originalFactory = (node, view, getPos) => new MU.CodeView(node, view, getPos, null)
    const wrappedFactory = frontMatterPlugin.makeCodeBlockFactory(originalFactory, null, { sanitize: (html) => html })
    const plugin = frontMatterPlugin.createPlugin()
    const state = EditorState.create({ schema, doc, plugins: [plugin] })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: wrappedFactory } })
    const instance = view.nodeDOM(0).codeView
    expect(instance.positionValid).toBe(true)

    const metadataBlock = schema.node('code_block', { language: 'metadata' }, schema.text('title: X'))
    view.dispatch(view.state.tr.insert(0, metadataBlock))
    // A pure position shift -- doesn't reach FrontMatterView.update() at all (see that
    // class's own doc comment); the Plugin's view-update hook, wired via createPlugin()
    // above, is what calls checkAllPositions() on every transaction including this one.

    expect(instance.positionValid).toBe(true)
    expect(instance.mode).toBe('rendered')

    view.destroy()
    container.remove()
  })
})

// Mirrors mermaid-plugin.test.js's wrapPasteCodeForDiagram coverage: on
// macOS, Cmd+V never reaches the DOM as a paste event -- NSResponder's
// paste(_:) calls MU.pasteCode(text) directly, bypassing
// handleDOMEvents.paste entirely.
describe('wrapPasteCodeForFrontMatter: MU.pasteCode, the path native macOS paste actually uses', () => {
  let originalPasteCode
  beforeEach(() => { originalPasteCode = MU.pasteCode })
  afterEach(() => { MU.pasteCode = originalPasteCode })

  it('replaces the WHOLE content of a selected Rendered-mode block, not a splice at the cursor', () => {
    const doc = leadingHtmlDoc('<p>old</p>')
    const { view, teardown } = mountView(doc)
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))
    frontMatterPlugin.wrapPasteCodeForFrontMatter(view)

    MU.pasteCode('<p>new</p>')

    expect(view.state.doc.firstChild.textContent).toBe('<p>new</p>')

    teardown()
  })

  it('delegates to the original MU.pasteCode for a plain (non-rendered-selected) code_block', () => {
    const doc = schema.node('doc', null, [
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
    const { view, teardown } = mountView(doc)
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))
    const spy = () => {}
    let called = null
    MU.pasteCode = (text) => { called = text }
    frontMatterPlugin.wrapPasteCodeForFrontMatter(view)

    MU.pasteCode('!')

    expect(called).toBe('!')

    teardown()
  })

  it('deletes the content entirely when pasted text is empty', () => {
    const doc = leadingHtmlDoc('<p>old</p>')
    const { view, teardown } = mountView(doc)
    view.dispatch(view.state.tr.setSelection(Selection.near(view.state.doc.resolve(1))))
    frontMatterPlugin.wrapPasteCodeForFrontMatter(view)

    MU.pasteCode('')

    expect(view.state.doc.firstChild.textContent).toBe('')

    teardown()
  })
})
