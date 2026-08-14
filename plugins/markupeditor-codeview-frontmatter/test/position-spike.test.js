import { describe, it, expect } from 'vitest'
import { Schema, EditorState, EditorView } from 'markupeditor'

// Closes the single riskiest assumption behind FrontMatterView: what
// happens when a preceding sibling is inserted before a code_block,
// shifting its position from 0 to something greater, with the code_block's
// own attrs/content unchanged?
//
// The ORIGINAL design assumed ProseMirror would call update() on the
// existing NodeView (with getPos() now returning the new position), and
// that FrontMatterView.update() returning false in that case would tell
// ProseMirror to discard the instance and rebuild via the factory. That
// assumption was WRONG -- verified empirically below, not by reading
// prosemirror-view's source alone. update() is genuinely never called for
// a PURE position shift (no change to the node's own attrs/content):
// ProseMirror's reconciliation determines the node is structurally
// unchanged and simply relocates the existing DOM/NodeView, with no
// update() notification at all. getPos() IS a live closure and correctly
// reflects the new position immediately -- it just isn't accompanied by a
// callback telling the instance to re-check anything.
//
// This is why the real implementation does NOT rely on update() as the
// enforcement mechanism: FrontMatterPlugin's Plugin view-update hook (which
// DOES fire on every transaction) calls FrontMatterView.checkAllPositions()
// to actively re-check every live instance's getPos() and self-correct via
// forceSourceOnly() when it's drifted, rather than waiting for a
// notification that will never come in the pure-shift case.
//
// Confirmed via markupeditor-base source tracing that no keyboard gesture
// can currently trigger this -- Enter/Backspace both
// no-op at the start of a leading code_block. So this spike dispatches a
// transaction directly (state.tr.insert(0, paragraph)), simulating
// whatever OTHER path might insert content before position 0 (paste,
// undo/redo, or a future fix to that gap).
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

// Stand-in for FrontMatterView -- this spike is only about the
// destroy-vs-update MECHANISM at a position boundary, not the real class's
// sanitization/rendering behavior, so a minimal NodeView tracking update()
// calls, destruction, and a "forced source-only" flag is enough.
class MarkerView {
  constructor(node, view, getPos, marker) {
    this.dom = document.createElement('pre')
    this.contentDOM = document.createElement('code')
    this.dom.appendChild(this.contentDOM)
    this.dom.marker = marker
    this.getPos = getPos
    this.updateCalls = []
    this.destroyed = false
  }
  update(node) {
    if (node.type.name !== 'code_block') return false
    this.updateCalls.push(this.getPos())
    return true
  }
  destroy() { this.destroyed = true }
}

function isFrontMatterLanguage(language) {
  return (language ?? '').trim().toLowerCase() === 'html'
}

function docWithLeadingHtmlBlock() {
  return schema.node('doc', null, [
    schema.node('code_block', { language: 'html' }, schema.text('<p>preamble</p>')),
    schema.node('paragraph', null, schema.text('body text'))
  ])
}

function insertParagraphBefore(view) {
  const insertedParagraph = schema.node('paragraph', null, schema.text('inserted first'))
  view.dispatch(view.state.tr.insert(0, insertedParagraph))
  return insertedParagraph
}

describe('position-0 tracking when a preceding sibling is inserted (the update()-never-fires finding)', () => {
  it('getPos() is a live closure reflecting the shift, but update() is never called and the instance is neither destroyed nor recreated', () => {
    const doc = docWithLeadingHtmlBlock()
    const instances = []
    const factory = (node, view, getPos) => {
      const instance = new MarkerView(node, view, getPos, 'frontmatter')
      instances.push(instance)
      return instance
    }

    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, { state, nodeViews: { code_block: factory } })

    expect(instances).toHaveLength(1)
    const [instance] = instances
    expect(instance.getPos()).toBe(0)

    const insertedParagraph = insertParagraphBefore(view)

    // The finding, stated as assertions: same instance, live getPos(), but
    // genuinely zero update() calls.
    expect(instances).toHaveLength(1) // factory was not called again
    expect(instance.destroyed).toBe(false)
    expect(instance.updateCalls).toHaveLength(0) // update() never fired
    expect(instance.getPos()).toBe(insertedParagraph.nodeSize) // yet getPos() is correct and live

    view.destroy()
    container.remove()
  })

  it('the real mechanism: a Plugin view-update hook that actively re-checks every live instance catches what update() cannot', () => {
    const doc = docWithLeadingHtmlBlock()
    const liveInstances = new Set()

    // Mirrors FrontMatterView's actual checkAllPositions()/forceSourceOnly()
    // shape, using MarkerView as the stand-in class under test.
    class TrackedMarkerView extends MarkerView {
      constructor(node, view, getPos) {
        super(node, view, getPos, 'frontmatter')
        this.positionValid = true
        liveInstances.add(this)
      }
      forceSourceOnly() {
        if (!this.positionValid) return
        this.positionValid = false
        this.dom.marker = 'forced-source-only'
      }
      destroy() {
        liveInstances.delete(this)
        super.destroy()
      }
      static checkAllPositions() {
        for (const instance of liveInstances) {
          if (instance.getPos() !== 0) instance.forceSourceOnly()
        }
      }
    }

    const factory = (node, view, getPos) => new TrackedMarkerView(node, view, getPos)
    const state = EditorState.create({ schema, doc })
    const container = document.body.appendChild(document.createElement('div'))
    const view = new EditorView(container, {
      state,
      nodeViews: { code_block: factory },
      // The mechanism under test: a Plugin view-update hook, not the
      // NodeView's own update(), driving the check.
      plugins: []
    })

    const [instance] = liveInstances
    expect(instance.positionValid).toBe(true)
    expect(view.nodeDOM(0).marker).toBe('frontmatter')

    insertParagraphBefore(view)
    // Simulates what FrontMatterPlugin's Plugin.view.update hook does on
    // every transaction -- called manually here since this spike's
    // EditorView has no real Plugin registered.
    TrackedMarkerView.checkAllPositions()

    expect(instance.positionValid).toBe(false)
    expect(instance.dom.marker).toBe('forced-source-only')
    expect(instance.destroyed).toBe(false) // self-corrected in place, not torn down

    view.destroy()
    container.remove()
  })
})
