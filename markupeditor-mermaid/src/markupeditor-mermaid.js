import { MU, Plugin, Decoration, DecorationSet } from "markupeditor"
import mermaid from "mermaid"

mermaid.initialize()

const view = MU.activeView()
console.log('markupeditor-mermaid: MU.activeView() ->', view)

// --- RDR-022 P1 spike (throwaway): de-risk the CSS-collapse + widget
// substitution technique before P2 builds real render/cache logic on top of
// it. Decorates every code_block regardless of language — matching on
// "mermaid" specifically is P2/P3's concern, not this probe's. To be removed
// and replaced entirely once the technique is validated.
if (view) {
  function computeSpikeDecorations(doc) {
    const decorations = []
    doc.descendants((node, pos) => {
      if (node.type.name !== 'code_block') return
      decorations.push(Decoration.node(pos, pos + node.nodeSize, { style: 'display: none' }))
      // Positioned just AFTER the node (not inside its content) so the widget
      // renders as a sibling in the document flow, not as a descendant of the
      // <pre> element the line above just hid — a widget placed inside a
      // display:none parent is hidden right along with it.
      decorations.push(Decoration.widget(pos + node.nodeSize, () => {
        const div = document.createElement('div')
        div.textContent = 'DIAGRAM PLACEHOLDER (P1 spike)'
        div.style.border = '1px dashed #888'
        div.style.padding = '8px'
        div.contentEditable = 'false'
        return div
      }, { side: 1 }))
    })
    return DecorationSet.create(doc, decorations)
  }

  const spikePlugin = new Plugin({
    state: {
      init(_, { doc }) { return computeSpikeDecorations(doc) },
      apply(tr, set) { return tr.docChanged ? computeSpikeDecorations(tr.doc) : set.map(tr.mapping, tr.doc) }
    },
    props: {
      decorations(state) { return spikePlugin.getState(state) }
    }
  })

  view.updateState(view.state.reconfigure({ plugins: [...view.state.plugins, spikePlugin] }))
}
