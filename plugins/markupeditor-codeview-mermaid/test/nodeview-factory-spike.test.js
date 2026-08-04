import { describe, it, expect } from 'vitest'
import { Schema, EditorState, EditorView } from 'markupeditor'

// RDR-024-abandoned-in-favor-of-lightweight-beads / MarkupEditorApp-1qfq.1 spike.
//
// Closes the single riskiest assumption behind the MermaidView refactor
// (epic MarkupEditorApp-1qfq): that markupeditor-mermaid, loaded via userScript
// well AFTER markupeditor-base's own EditorView already exists (with its own
// direct nodeViews.code_block factory baked in at construction time,
// markupeditor.js), can still swap which constructor runs for code_block —
// including for a code_block that is already rendered on the page — purely
// via `view.setProps({ nodeViews: {...} })`, with no markupeditor-base change
// at all. Kept as a permanent regression test, not discarded once it served
// its purpose, matching RDR-023's own precedent (its Finding 3 backreference
// spike).
//
// Verified by reading prosemirror-view 1.41.4's own source
// (EditorView.updateStateInner, dist/index.js) before writing this: a
// nodeViews prop change is detected by reference inequality
// (`this._props.nodeViews != prevProps.nodeViews`), and if buildNodeViews'
// merged result actually differs (changedNodeViews), `redraw = true`, which
// unconditionally destroys the ENTIRE existing docView and rebuilds it fresh
// (`this.docView.destroy(); this.docView = docViewDesc(...)`) — every
// NodeView in the whole document is torn down and reconstructed, not just
// code_block ones. This test proves that end-to-end rather than trusting the
// source read alone.
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

// Stand-ins for CodeView/MermaidView — this spike is only about the
// factory-swap MECHANISM, not the real classes' own behavior (covered by
// later phases, MarkupEditorApp-1qfq.2/.3), so a minimal NodeView with a
// distinguishing marker and a destroy() flag is enough.
class MarkerView {
  constructor(node, view, getPos, marker) {
    this.dom = document.createElement('pre')
    this.contentDOM = document.createElement('code')
    this.dom.appendChild(this.contentDOM)
    this.dom.marker = marker
    this.destroyed = false
  }
  destroy() { this.destroyed = true }
}

function isMermaidLanguage(language) {
  return (language ?? '').trim().toLowerCase() === 'mermaid'
}

function docWithTwoCodeBlocks() {
  return schema.node('doc', null, [
    schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B;')),
    schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
  ])
}

describe('code_block NodeView factory swap via view.setProps (no markupeditor-base change)', () => {
  it('swaps the constructor used for an ALREADY-RENDERED mermaid code_block, leaves a co-existing non-mermaid one on the original factory, and destroys the superseded instance', () => {
    const doc = docWithTwoCodeBlocks()
    const originalInstances = []
    const originalFactory = (node, view, getPos) => {
      const instance = new MarkerView(node, view, getPos, 'plain')
      originalInstances.push(instance)
      return instance
    }

    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, {
      state,
      nodeViews: { code_block: originalFactory }
    })

    // Both blocks render with the original factory before mermaid ever loads.
    const mermaidPos = 0
    const jsPos = doc.firstChild.nodeSize
    expect(view.nodeDOM(mermaidPos).marker).toBe('plain')
    expect(view.nodeDOM(jsPos).marker).toBe('plain')
    expect(originalInstances).toHaveLength(2)
    const [mermaidInstanceBefore, jsInstanceBefore] = originalInstances

    // Mermaid's own load-time wiring: capture the existing factory off
    // view.props (confirms the getter surfaces the constructor-time value,
    // the other half of Finding 3's gap), then install a wrapping factory
    // that only diverts mermaid-language blocks.
    const capturedOriginal = view.props.nodeViews.code_block
    expect(capturedOriginal).toBe(originalFactory)

    const mermaidInstances = []
    const wrappingFactory = (node, view, getPos) => {
      if (isMermaidLanguage(node.attrs.language)) {
        const instance = new MarkerView(node, view, getPos, 'mermaid')
        mermaidInstances.push(instance)
        return instance
      }
      return capturedOriginal(node, view, getPos)
    }

    view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: wrappingFactory } })

    // The already-rendered mermaid block now gets a MermaidView stand-in...
    expect(view.nodeDOM(mermaidPos).marker).toBe('mermaid')
    expect(mermaidInstances).toHaveLength(1)
    // ...and the superseded plain instance for that SAME position was torn
    // down, not leaked.
    expect(mermaidInstanceBefore.destroyed).toBe(true)

    // The co-existing non-mermaid block keeps getting the original factory,
    // routed through the SAME wrapping factory (not misrouted to mermaid) —
    // full-docView redraw (confirmed via source read) means this instance is
    // also destroyed and reconstructed, not merely left alone, so this
    // assertion is on marker identity/type, not instance identity.
    expect(view.nodeDOM(jsPos).marker).toBe('plain')
    expect(jsInstanceBefore.destroyed).toBe(true)

    view.destroy()
    container.remove()
  })
})

describe('diagram widget as a DOM sibling of contentDOM, never a descendant collapsed along with it', () => {
  // The CURRENT decoration-based diagram widget deliberately sits OUTSIDE the
  // code_block's own span (pos + node.nodeSize), specifically because a
  // widget positioned where the node's own collapsing decoration reaches
  // would be affected by it too (markupeditor-mermaid.js's own comment on
  // computeMermaidDecorations). Under NodeView ownership, `dom` (the `<pre>`)
  // is never collapsed wholesale — only `contentDOM` (the `<code>`) gets the
  // hidden-text treatment (mirrors .mermaid-hidden-pre/.mermaid-hidden-text,
  // scoped in the CURRENT design to the pre and an inline decoration
  // respectively) — so a diagram box appended as dom's OTHER child, a
  // sibling of contentDOM rather than a descendant, is structurally
  // independent of whatever class contentDOM carries. This is a DOM-shape
  // assertion, not a real-layout one: jsdom's mocked adoptedStyleSheets
  // (vitest.setup.js) never actually parses/applies CSS rules, matching this
  // codebase's existing precedent of asserting classList membership rather
  // than computed visual layout (e.g. the "-below" positioning tests).
  it('toggling a collapsing class on contentDOM alone never touches dom\'s own class list or removes/hides the diagram sibling', () => {
    const dom = document.createElement('pre')
    const contentDOM = document.createElement('code')
    dom.appendChild(contentDOM)
    const diagramBox = document.createElement('div')
    diagramBox.className = 'mermaid-diagram'
    dom.appendChild(diagramBox) // sibling of contentDOM, not inside it

    const setDiagramMode = (isDiagram) => {
      contentDOM.classList.toggle('mermaid-hidden-code', isDiagram)
      // dom itself is NEVER touched — this is the property under test.
    }

    setDiagramMode(true)
    expect(dom.classList.contains('mermaid-hidden-code')).toBe(false)
    expect(contentDOM.classList.contains('mermaid-hidden-code')).toBe(true)
    expect(Array.from(dom.children)).toEqual([contentDOM, diagramBox])
    expect(diagramBox.classList.contains('mermaid-hidden-code')).toBe(false)

    setDiagramMode(false)
    expect(dom.classList.contains('mermaid-hidden-code')).toBe(false)
    expect(contentDOM.classList.contains('mermaid-hidden-code')).toBe(false)
    expect(Array.from(dom.children)).toEqual([contentDOM, diagramBox])
  })
})

// Follow-up question, asked directly (not part of the original spike ask,
// but the same "verify, don't assume" discipline applies): does the
// capture-wrap-delegate idiom compose when a SECOND, wholly independent
// diagram-type plugin (a hypothetical markupeditor-geojson, built by an
// unrelated developer who has never seen markupeditor-mermaid's source)
// installs the exact same pattern against a `code_block` that already has
// mermaid's own wrapping factory installed?
//
// Answer, verified below: yes, IF the second plugin follows the same
// contract — capture `view.props.nodeViews.code_block` at ITS OWN load
// time (not a value cached earlier) and delegate to that captured value for
// any language it doesn't own, rather than reconstructing a fresh
// `CodeView` directly. The chain composes correctly regardless of load
// order, because each link only ever wraps "whatever is there right now" —
// nothing about the mechanism requires the two plugins to know about each
// other, coordinate, or load in a specific order. `loadPlugins`
// (markupeditor-base/src/main.js) imports every plugin path CONCURRENTLY
// via `Promise.all`, so real load order between two independently-authored
// plugins is not guaranteed reproducible run-to-run — this composability
// property is what makes that non-issue rather than a race condition.
//
// The SECOND test below demonstrates the real, unenforced failure mode: a
// plugin that does not follow the contract (constructs `new CodeView(...)`
// directly instead of delegating to the captured prior factory) silently
// discards whatever the previous plugin installed, with no error, no
// warning — a genuine risk for a true multi-developer ecosystem, not just a
// hypothetical.
describe('composability with a second, independently-authored language-specific factory', () => {
  function isGeojsonLanguage(language) {
    return (language ?? '').trim().toLowerCase() === 'geojson'
  }

  function docWithThreeCodeBlocks() {
    return schema.node('doc', null, [
      schema.node('code_block', { language: 'mermaid' }, schema.text('graph TD; A-->B;')),
      schema.node('code_block', { language: 'geojson' }, schema.text('{"type":"Point"}')),
      schema.node('code_block', { language: 'javascript' }, schema.text('const x = 1;'))
    ])
  }

  // Installs the well-behaved capture-wrap-delegate pattern for `marker`,
  // matching MermaidView's own planned wiring (MarkupEditorApp-1qfq.4).
  function installWellBehavedFactory(view, isOwnLanguage, marker) {
    const capturedPrior = view.props.nodeViews.code_block
    const factory = (node, v, getPos) => {
      if (isOwnLanguage(node.attrs.language)) return new MarkerView(node, v, getPos, marker)
      return capturedPrior(node, v, getPos)
    }
    view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: factory } })
  }

  it('two well-behaved plugins compose correctly, in either load order', () => {
    for (const loadMermaidFirst of [true, false]) {
      const doc = docWithThreeCodeBlocks()
      const state = EditorState.create({ schema, doc })
      const container = document.body.appendChild(document.createElement('div'))
      const view = new EditorView(container, {
        state,
        nodeViews: { code_block: (node, v, getPos) => new MarkerView(node, v, getPos, 'plain') }
      })

      const installMermaid = () => installWellBehavedFactory(view, isMermaidLanguage, 'mermaid')
      const installGeojson = () => installWellBehavedFactory(view, isGeojsonLanguage, 'geojson')
      if (loadMermaidFirst) { installMermaid(); installGeojson() } else { installGeojson(); installMermaid() }

      const mermaidPos = 0
      const geojsonPos = doc.child(0).nodeSize
      const jsPos = geojsonPos + doc.child(1).nodeSize

      expect(view.nodeDOM(mermaidPos).marker).toBe('mermaid')
      expect(view.nodeDOM(geojsonPos).marker).toBe('geojson')
      expect(view.nodeDOM(jsPos).marker).toBe('plain') // untouched language still falls all the way through

      view.destroy()
      container.remove()
    }
  })

  it('a plugin that does NOT delegate (constructs CodeView directly instead of calling the captured prior factory) silently discards a previously-installed factory', () => {
    const doc = docWithThreeCodeBlocks()
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, {
      state,
      nodeViews: { code_block: (node, v, getPos) => new MarkerView(node, v, getPos, 'plain') }
    })

    installWellBehavedFactory(view, isMermaidLanguage, 'mermaid')

    const mermaidPos = 0
    expect(view.nodeDOM(mermaidPos).marker).toBe('mermaid') // correct, before the sloppy plugin loads

    // The sloppy plugin: handles its own language, but falls back to a
    // FRESH plain factory for everything else instead of delegating to
    // `view.props.nodeViews.code_block` — the mistake this test exists to
    // catch, not a contrived strawman: it's the natural thing to write if a
    // third-party developer copies CodeView's own registration snippet
    // (markupeditor.js's `code_block(node, view, getPos) { return new
    // CodeView(node, view, getPos, languageDialog) }`) instead of reading
    // mermaid's own wrap-and-delegate idiom.
    const sloppyFactory = (node, v, getPos) => {
      if (isGeojsonLanguage(node.attrs.language)) return new MarkerView(node, v, getPos, 'geojson')
      return new MarkerView(node, v, getPos, 'plain')
    }
    view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: sloppyFactory } })

    const geojsonPos = doc.child(0).nodeSize
    expect(view.nodeDOM(geojsonPos).marker).toBe('geojson') // the sloppy plugin's own language still works...

    // ...but mermaid's own wrapping was silently discarded, no error, no
    // warning: this position now falls through to the sloppy factory's own
    // "everything else" branch, which knows nothing about mermaid.
    expect(view.nodeDOM(mermaidPos).marker).toBe('plain') // WRONG — should still be 'mermaid'

    view.destroy()
    container.remove()
  })
})
