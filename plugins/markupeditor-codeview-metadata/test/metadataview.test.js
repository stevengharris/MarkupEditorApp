import { describe, it, expect } from 'vitest'
import { Schema, EditorState, EditorView, MU, Plugin, NodeSelection, TextSelection } from 'markupeditor'
import { MetadataView, isMetadataLanguage, parseMetadataRows } from '../src/metadataview.js'
import { metadataPluginKey } from '../src/metadatapluginkey.js'

// MetadataView unit coverage in isolation, via a hand-wired nodeViews
// factory plus a minimal stand-in for MetadataPlugin's own collapse-state
// Plugin (so toggleCollapsed()/syncCollapsedFromPluginState() have
// somewhere real to read/write) -- NOT through metadataplugin.js's real
// entry-point wiring (view.setProps + the appendTransaction guard), which
// metadata-plugin.test.js covers instead.

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

function collapseStatePlugin() {
  return new Plugin({
    key: metadataPluginKey,
    state: {
      init: () => ({ collapsed: false }),
      apply: (tr, value) => {
        const meta = tr.getMeta(metadataPluginKey)
        if (meta && typeof meta.collapsed === 'boolean') return { collapsed: meta.collapsed }
        return value
      }
    },
    view: () => ({ update: () => MetadataView.syncAllCollapsedState() })
  })
}

function selectionSyncPlugin() {
  return new Plugin({
    view: () => ({ update: (v) => MetadataView.syncAllSelectedState(v.state) })
  })
}

function metadataDoc(text = 'title: My Post\nauthor: Steve') {
  return schema.node('doc', null, [
    schema.node('code_block', { language: 'metadata' }, text ? schema.text(text) : undefined),
    schema.node('paragraph', null, schema.text('body'))
  ])
}

function mountView(doc) {
  const nodeViews = {
    code_block: (node, view, getPos) => {
      if (isMetadataLanguage(node.attrs.language) && getPos() === 0) return new MetadataView(node, view, getPos, null)
      return new MU.CodeView(node, view, getPos, null)
    }
  }
  const state = EditorState.create({ schema, doc, plugins: [collapseStatePlugin(), selectionSyncPlugin()] })
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

describe('isMetadataLanguage', () => {
  it.each([
    ['metadata', true],
    ['Metadata', true],
    [' METADATA ', true],
    ['html', false],
    ['mermaid', false],
    [null, false],
    [undefined, false],
  ])('%s -> %s', (input, expected) => {
    expect(isMetadataLanguage(input)).toBe(expected)
  })
})

describe('parseMetadataRows', () => {
  it('parses simple key: value lines', () => {
    expect(parseMetadataRows('title: My Post\nauthor: Steve')).toEqual([
      { key: 'title', value: 'My Post' },
      { key: 'author', value: 'Steve' }
    ])
  })

  it('skips blank lines, comments, and a leading/trailing --- fence', () => {
    expect(parseMetadataRows('---\ntitle: X\n\n# a comment\n---')).toEqual([
      { key: 'title', value: 'X' }
    ])
  })

  it('returns an empty array for empty or unparseable content', () => {
    expect(parseMetadataRows('')).toEqual([])
    expect(parseMetadataRows('just some prose, no colons here at all if trimmed oddly')).toEqual([])
  })
})

describe('MetadataView defaults', () => {
  it('defaults to Table mode, opposite of FrontMatterView', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    expect(instance).toBeInstanceOf(MetadataView)
    expect(instance.mode).toBe('table')
    teardown()
  })

  it('hides the raw Source content on initial construction, not just after a later mode switch', () => {
    // Regression: setMode(true) in the constructor was a no-op if this.mode
    // already equaled 'table' before that call, since setMode short-circuits
    // on "already there" -- meaning the initial DOM classes (hiding
    // contentDOM, showing the table) never got applied until some LATER
    // mode change triggered them. A freshly constructed instance must not
    // show raw Source text underneath the Table view.
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    expect(instance.contentDOM.classList.contains('metadata-hidden-code')).toBe(true)
    expect(instance.tableContainer.style.display).not.toBe('none')
    teardown()
  })

  it('renders one row per metadata key in Table mode, as grid cells sharing one column width', () => {
    const { view, teardown } = mountView(metadataDoc('title: My Post\nauthor: Steve'))
    const instance = view.nodeDOM(0).codeView
    const keys = instance.tableContainer.querySelectorAll('.metadata-table-key')
    const values = instance.tableContainer.querySelectorAll('.metadata-table-value')
    expect(keys.length).toBe(2)
    expect(values.length).toBe(2)
    expect(keys[0].textContent).toBe('title')
    expect(values[0].textContent).toBe('My Post')
    expect(keys[1].textContent).toBe('author')
    expect(values[1].textContent).toBe('Steve')
    // The second row's cells carry the border/stripe markers that visually
    // separate rows within the shared grid; the first row's don't.
    expect(keys[0].classList.contains('metadata-table-row-border')).toBe(false)
    expect(keys[1].classList.contains('metadata-table-row-border')).toBe(true)
    expect(keys[1].classList.contains('metadata-table-striped')).toBe(true)
    teardown()
  })

  it('shows an empty-state placeholder, not a broken empty table, for an empty block', () => {
    const { view, teardown } = mountView(metadataDoc(''))
    const instance = view.nodeDOM(0).codeView
    expect(instance.tableContainer.classList.contains('metadata-table-empty')).toBe(true)
    expect(instance.tableContainer.textContent).toBe('No metadata')
    teardown()
  })

  it('Source tab switches to the editable contentDOM and hides Table', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    instance.sourceTab.dispatchEvent(new Event('mousedown', { bubbles: true }))
    expect(instance.mode).toBe('source')
    expect(instance.contentDOM.classList.contains('metadata-hidden-code')).toBe(false)
    expect(instance.tableContainer.style.display).toBe('none')
    teardown()
  })

  it('never shows the inherited Language tab -- setActive is suppressed entirely', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    instance.setActive(true)
    expect(instance.dom.contains(instance.tab)).toBe(false)
    teardown()
  })
})

describe('MetadataView collapse/expand', () => {
  it('defaults to expanded', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(false)
    teardown()
  })

  it('clicking the bar toggles collapsed, and clicking again reopens it', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView

    instance.bar.dispatchEvent(new Event('mousedown', { bubbles: true }))
    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(true)
    expect(instance.disclosure.classList.contains('metadata-disclosure-collapsed')).toBe(true)

    instance.bar.dispatchEvent(new Event('mousedown', { bubbles: true }))
    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(false)
    teardown()
  })

  it('clicking Source while collapsed expands and switches to Source, not a silent no-op', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    instance.bar.dispatchEvent(new Event('mousedown', { bubbles: true })) // collapse first
    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(true)

    instance.sourceTab.dispatchEvent(new Event('mousedown', { bubbles: true }))

    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(false)
    expect(instance.mode).toBe('source')
    teardown()
  })

  it('clicking Table while collapsed expands and switches to Table', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    instance.bar.dispatchEvent(new Event('mousedown', { bubbles: true })) // collapse first
    instance.sourceTab.dispatchEvent(new Event('mousedown', { bubbles: true })) // switch away from Table too

    instance.bar.dispatchEvent(new Event('mousedown', { bubbles: true })) // re-collapse
    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(true)
    instance.tableTab.dispatchEvent(new Event('mousedown', { bubbles: true }))

    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(false)
    expect(instance.mode).toBe('table')
    teardown()
  })

  it('clicking Table/Source while already expanded does not re-collapse afterward', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(false)

    instance.sourceTab.dispatchEvent(new Event('mousedown', { bubbles: true }))

    expect(instance.content.classList.contains('metadata-content-collapsed')).toBe(false)
    teardown()
  })
})

describe('MetadataView position-0 enforcement', () => {
  it('renders as an ordinary code block (no bar, no Table/Source) once no longer at position 0', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView

    // Simulate MetadataPlugin's checkAllPositions() observing a displaced instance --
    // getPos() now reports something other than 0 (a preceding sibling was inserted).
    instance.getPos = () => 1
    MetadataView.checkAllPositions()

    expect(instance.positionValid).toBe(false)
    expect(instance.dom.contains(instance.bar)).toBe(false)
    expect(instance.dom.contains(instance.content)).toBe(false)
    expect(instance.contentDOM.classList.contains('metadata-hidden-code')).toBe(false)
    teardown()
  })

  it('is idempotent -- calling checkAllPositions again after already-forced is a no-op', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    instance.getPos = () => 1
    MetadataView.checkAllPositions()
    MetadataView.checkAllPositions()
    expect(instance.positionValid).toBe(false)
    teardown()
  })

  it('a displaced instance no longer responds to bar clicks', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    instance.getPos = () => 1
    MetadataView.checkAllPositions()
    instance.toggleCollapsed()
    // No bar to click in the DOM any more, but guard the method itself too.
    expect(instance.dom.contains(instance.bar)).toBe(false)
    teardown()
  })
})

describe('MetadataView content updates while in Table mode', () => {
  it('keeps Source hidden after a content update -- regression for super.update() clobbering contentDOM.className', () => {
    // super.update() -> syncLanguageClass() does `contentDOM.className = ...`, a full
    // overwrite, not additive -- it used to silently wipe HIDDEN_CODE_CLASS on every
    // content change (i.e. every keystroke while positioned inside contentDOM),
    // leaving both Table and the raw Source text visible at once.
    const { view, teardown } = mountView(metadataDoc('title: X'))
    const instance = view.nodeDOM(0).codeView
    expect(instance.contentDOM.classList.contains('metadata-hidden-code')).toBe(true)

    const tr = view.state.tr.insertText('Y', 1, 1)
    view.dispatch(tr)

    expect(view.nodeDOM(0).codeView).toBe(instance) // same instance, went through update() not reconstruction
    expect(instance.contentDOM.classList.contains('metadata-hidden-code')).toBe(true)
    teardown()
  })

  it('re-renders Table with the updated content after a text change', () => {
    const { view, teardown } = mountView(metadataDoc('title: X'))
    const instance = view.nodeDOM(0).codeView
    const textEnd = 1 + 'title: X'.length // end of the code_block's text content
    view.dispatch(view.state.tr.insertText('Y', textEnd, textEnd)) // "title: X" -> "title: XY"
    const rows = instance.tableContainer.querySelectorAll('.metadata-table-value')
    expect(rows[0].textContent).toBe('XY')
    teardown()
  })
})

describe('MetadataView selection outline', () => {
  // Driven directly from live selection state (a real NodeSelection wrapping the
  // block), not from setActive/codeLanguageTabPlugin -- CodeView's own doc comment
  // says code_block selection is "a TextSelection inside its content, never a
  // NodeSelection", so that mechanism never fires for the selection kind landing
  // on a Table-mode block now creates (MetadataPlugin.handleMetadataArrowKey).
  it('shows a selected outline on the whole block (dom), not just the table, when NodeSelection-selected in Table mode', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))
    expect(instance.dom.classList.contains('metadata-selected')).toBe(true)

    // Moving selection elsewhere (an ordinary TextSelection, not on this block) clears it.
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, view.state.doc.content.size)))
    expect(instance.dom.classList.contains('metadata-selected')).toBe(false)
    teardown()
  })

  it('does not show the outline in Source mode even when NodeSelection-selected', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))
    instance.setMode(false) // Source
    expect(instance.dom.classList.contains('metadata-selected')).toBe(false)
    teardown()
  })

  it('moves the outline back when switching modes while still selected', () => {
    const { view, teardown } = mountView(metadataDoc())
    const instance = view.nodeDOM(0).codeView
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, 0)))
    expect(instance.dom.classList.contains('metadata-selected')).toBe(true)
    instance.setMode(false) // Source
    expect(instance.dom.classList.contains('metadata-selected')).toBe(false)
    instance.setMode(true) // back to Table
    expect(instance.dom.classList.contains('metadata-selected')).toBe(true)
    teardown()
  })
})
