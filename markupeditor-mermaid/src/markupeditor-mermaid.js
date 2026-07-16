import { MU, Plugin, Decoration, DecorationSet } from "markupeditor"
import mermaid from "mermaid"

mermaid.initialize()

export function isMermaidLanguage(language) {
  return (language ?? '').trim().toLowerCase() === 'mermaid'
}

// Ported from markupeditor-base's src/setup/index.js (not exported from there,
// so duplicated here rather than shared) — walks cur's children, comparing
// against old's, skipping any subtree that's the same node object as before
// (ProseMirror's persistent-tree structural sharing means an unchanged
// subtree is reference-identical). Only visits nodes in the changed region.
function changedDescendants(old, cur, offset, f) {
  const oldSize = old.childCount, curSize = cur.childCount
  outer: for (let i = 0, j = 0; i < curSize; i++) {
    const child = cur.child(i)
    for (let scan = j, e = Math.min(oldSize, i + 3); scan < e; scan++) if (old.child(scan) == child) {
      j = scan + 1
      offset += child.nodeSize
      continue outer
    }
    f(child, offset)
    if (j < oldSize && old.child(j).sameMarkup(child)) changedDescendants(old.child(j), child, offset + 1, f)
    else child.nodesBetween(0, child.content.size, f, offset + 1)
    offset += child.nodeSize
  }
}

/**
 * Build the mermaidRenderPlugin. `render` and `dispatch` are injectable so
 * tests can control render timing/outcome and observe dispatch without a
 * real EditorView. Defaults are what production actually uses.
 */
export function createMermaidRenderPlugin({ render = mermaid.render.bind(mermaid), dispatch } = {}) {
  // Keyed by ProseMirror Node object identity, matching markupeditor-base's
  // codeHighlightCache pattern: a node that hasn't structurally changed keeps
  // its cached result across unrelated edits elsewhere in the document. Holds
  // one of {pending: true}, {svg: string}, or {error: string}.
  const renderCache = new WeakMap()
  let idCounter = 0

  function triggerRender(node) {
    const id = `mermaid-diagram-${idCounter++}`
    let renderPromise
    try {
      renderPromise = render(id, node.textContent)
    } catch (error) {
      renderCache.set(node, { error: error?.message ?? String(error) })
      dispatch()
      return
    }
    renderPromise
      .then((result) => { renderCache.set(node, { svg: result.svg }) })
      .catch((error) => { renderCache.set(node, { error: error?.message ?? String(error) }) })
      // dispatch() runs outside the render-outcome handling above, on its own
      // branch, so a throwing dispatch() can never be mistaken for a render
      // error and overwrite a correctly-cached success/error result.
      .finally(() => { dispatch() })
  }

  function widgetFor(cached) {
    const div = document.createElement('div')
    div.contentEditable = 'false'
    if (cached.svg) {
      div.className = 'mermaid-diagram'
      div.innerHTML = cached.svg
    } else if (cached.error) {
      div.className = 'mermaid-error'
      div.textContent = `Mermaid error: ${cached.error}`
      div.style.border = '1px solid #c00'
      div.style.color = '#c00'
      div.style.padding = '8px'
    } else {
      div.className = 'mermaid-placeholder'
      div.textContent = 'Rendering…'
      div.style.border = '1px dashed #888'
      div.style.padding = '8px'
    }
    return div
  }

  // Positioned at pos + node.nodeSize (a sibling immediately after the node in
  // document flow), never pos + 1 (inside the node's own content) — a widget
  // inside a node that itself carries the display:none Decoration.node below
  // is hidden right along with it. Found empirically during the P1 spike; see
  // RDR-022's "P1 Spike Findings" section. `key` is a per-node-instance id
  // (not just position), assigned in the WeakMap on first sight, so
  // WidgetType.eq() recognizes the same logical widget across recomputes
  // instead of rebuilding its DOM every time (position alone isn't distinct
  // enough here since the same key must not collide across cache states).
  function computeMermaidDecorations(doc) {
    const decorations = []
    doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block') return
      if (!isMermaidLanguage(node.attrs.language)) return

      decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: 'display: none' }))

      let cached = renderCache.get(node)
      if (!cached) {
        cached = { pending: true, key: `mermaid-widget-${idCounter++}` }
        renderCache.set(node, cached)
        triggerRender(node)
      }

      decorations.push(Decoration.widget(pos + node.nodeSize, () => widgetFor(cached), {
        side: 1,
        key: cached.key
      }))
    })
    return DecorationSet.create(doc, decorations)
  }

  const mermaidRenderPlugin = new Plugin({
    state: {
      init(_, { doc }) { return computeMermaidDecorations(doc) },
      apply(tr, set) {
        if (tr.getMeta('mermaid-rendered')) return computeMermaidDecorations(tr.doc)
        if (!tr.docChanged) return set
        let touchedCodeBlock = false
        const checkCodeBlock = (node) => { if (node.type.name === 'code_block') touchedCodeBlock = true }
        // Check both directions: a code_block added/changed in the new doc, and
        // one removed from the old doc (changedDescendants only ever visits
        // cur's children, so catching removal requires the swapped call too).
        changedDescendants(tr.before, tr.doc, 0, checkCodeBlock)
        if (!touchedCodeBlock) changedDescendants(tr.doc, tr.before, 0, checkCodeBlock)
        if (!touchedCodeBlock) return set.map(tr.mapping, tr.doc)
        return computeMermaidDecorations(tr.doc)
      }
    },
    props: {
      decorations(state) { return mermaidRenderPlugin.getState(state) }
    }
  })

  return { plugin: mermaidRenderPlugin, renderCache }
}

const view = MU.activeView()
if (view) {
  const { plugin } = createMermaidRenderPlugin({
    dispatch: () => view.dispatch(view.state.tr.setMeta('mermaid-rendered', true))
  })
  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, plugin] }))
}
