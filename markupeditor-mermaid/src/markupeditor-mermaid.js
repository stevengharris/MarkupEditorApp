import { MU, Plugin, Selection, TextSelection, NodeSelection, __parseFromClipboard } from "markupeditor"
import mermaid from "mermaid"
import mermaidStyle from "../styles/mermaid.css" with { type: "css" }
import { MermaidView, isMermaidLanguage } from "./mermaidview.js"

export { isMermaidLanguage }

// mermaid's render(id, text) (no container arg — our usage) appends its own
// temp element to document.body even on a parse error, and rethrows before
// its own cleanup runs; suppressErrorRendering takes an early cleanup path
// instead. We show our own Source-mode fallback on error and never wanted
// mermaid's own error SVG anyway. Not configurable per-call, only via
// initialize() — see mermaid.core.mjs's render().
const prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
mermaid.initialize({ theme: prefersDark ? 'dark' : 'default', suppressErrorRendering: true })

const HIDE_CARET_CLASS = 'mermaid-hide-caret'

function adoptMermaidStyles(view) {
  const root = view.dom.getRootNode()
  if (!root.adoptedStyleSheets?.includes(mermaidStyle)) {
    root.adoptedStyleSheets = [...root.adoptedStyleSheets, mermaidStyle]
  }
}

function mermaidViewAt(view, pos) {
  const instance = view.nodeDOM(pos)?.codeView
  return instance instanceof MermaidView ? instance : null
}

function diagramBlockAt(view, pos) {
  const instance = mermaidViewAt(view, pos)
  return instance?.mode === 'diagram' ? instance : null
}

// Plain ArrowLeft/ArrowRight treats a Diagram-mode code_block as a single
// atomic hop, like an image: arrowing in lands on the canonical position
// (blockPos + 1, a plain TextSelection — NOT a NodeSelection, which paints
// a stray native selection highlight over the tabs in this Safari+Shadow-DOM
// setup), arrowing again jumps past it.
function handleDiagramArrowKey(view, event) {
  if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
  if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
  const { state } = view
  const sel = state.selection
  if (!(sel instanceof TextSelection) || !sel.empty) return false
  const dir = event.key === 'ArrowLeft' ? -1 : 1

  if (sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
    const blockPos = sel.$from.before(sel.$from.depth)
    if (diagramBlockAt(view, blockPos)) {
      const node = state.doc.nodeAt(blockPos)
      const targetPos = dir < 0 ? blockPos : blockPos + node.nodeSize
      if (targetPos < 0 || targetPos > state.doc.content.size) return false
      const newSel = Selection.near(state.doc.resolve(targetPos), dir)
      view.dispatch(state.tr.setSelection(newSel).scrollIntoView())
      return true
    }
  }

  const targetPos = sel.from + dir
  if (targetPos < 0 || targetPos > state.doc.content.size) return false
  let blockPos = null
  if (dir > 0) {
    const node = state.doc.nodeAt(targetPos)
    if (node && node.type.name === 'code_block') blockPos = targetPos
  } else {
    const $target = state.doc.resolve(targetPos)
    if ($target.depth === 0) {
      const before = $target.nodeBefore
      if (before && before.type.name === 'code_block') blockPos = targetPos - before.nodeSize
    }
  }
  if (blockPos === null || !diagramBlockAt(view, blockPos)) return false
  const newSel = Selection.near(state.doc.resolve(blockPos + 1))
  view.dispatch(state.tr.setSelection(newSel).scrollIntoView())
  return true
}

// Delete/Backspace on (or adjacent to) a Diagram-mode block removes the
// WHOLE block atomically, like a selected image — not a single character of
// its collapsed, invisible source text.
function handleDiagramDeleteKey(view, event) {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return false
  if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
  const { state } = view
  const sel = state.selection
  if (!(sel instanceof TextSelection) || !sel.empty) return false
  const dir = event.key === 'Backspace' ? -1 : 1

  if (sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
    const blockPos = sel.$from.before(sel.$from.depth)
    const node = diagramBlockAt(view, blockPos) && state.doc.nodeAt(blockPos)
    if (node) {
      view.dispatch(state.tr.delete(blockPos, blockPos + node.nodeSize).scrollIntoView())
      return true
    }
  }

  const targetPos = sel.from + dir
  if (targetPos < 0 || targetPos > state.doc.content.size) return false
  if (dir < 0) {
    const $target = state.doc.resolve(targetPos)
    if ($target.depth !== 0) return false
    const before = $target.nodeBefore
    if (!before || before.type.name !== 'code_block') return false
    const blockPos = targetPos - before.nodeSize
    if (!diagramBlockAt(view, blockPos)) return false
    view.dispatch(state.tr.delete(blockPos, targetPos).scrollIntoView())
    return true
  } else {
    const node = state.doc.nodeAt(targetPos)
    if (!node || node.type.name !== 'code_block') return false
    if (!diagramBlockAt(view, targetPos)) return false
    view.dispatch(state.tr.delete(targetPos, targetPos + node.nodeSize).scrollIntoView())
    return true
  }
}

function selectedDiagramBlockPos(view) {
  const sel = view.state.selection
  if (!(sel instanceof TextSelection) || !sel.empty) return null
  if (sel.$from.depth === 0 || sel.$from.parent.type.name !== 'code_block') return null
  const blockPos = sel.$from.before(sel.$from.depth)
  return diagramBlockAt(view, blockPos) ? blockPos : null
}

// Writes the whole node to the clipboard via view.serializeForClipboard, the
// same method prosemirror-view's own native copy handler uses on a real
// NodeSelection's content() — needed here because the "selected" position is
// a collapsed TextSelection (see handleDiagramArrowKey), which that internal
// handler bails out of immediately.
function handleDiagramCopy(view, event) {
  const blockPos = selectedDiagramBlockPos(view)
  if (blockPos === null) return false
  const node = view.state.doc.nodeAt(blockPos)
  if (!node) return false
  const slice = NodeSelection.create(view.state.doc, blockPos).content()
  const { dom, text } = view.serializeForClipboard(slice)
  event.clipboardData?.clearData()
  event.clipboardData?.setData('text/html', dom.innerHTML)
  event.clipboardData?.setData('text/plain', text)
  event.preventDefault()
  return false
}

function handleDiagramCut(view, event) {
  const blockPos = selectedDiagramBlockPos(view)
  if (blockPos === null) return false
  handleDiagramCopy(view, event)
  const node = view.state.doc.nodeAt(blockPos)
  if (node) view.dispatch(view.state.tr.delete(blockPos, blockPos + node.nodeSize).scrollIntoView().setMeta('uiEvent', 'cut'))
  return false
}

// Registered via handleDOMEvents.paste, not the handlePaste prop:
// EditorView.someProp checks direct view props (where markupeditor-base's
// own generic code_block handlePaste lives) before any plugin's, so a
// plugin-level handlePaste here would never actually run first.
function handleDiagramPaste(view, event) {
  const blockPos = selectedDiagramBlockPos(view)
  if (blockPos === null) return false
  const node = view.state.doc.nodeAt(blockPos)
  if (!node) return false
  const data = event.clipboardData
  if (!data) return false
  const text = data.getData('text/plain') || data.getData('Text')
  const html = data.getData('text/html')
  const contentSel = TextSelection.create(view.state.doc, blockPos + 1, blockPos + node.nodeSize - 1)
  const slice = __parseFromClipboard(view, text, html, false, contentSel.$from)
  if (!slice) return false
  const tr = view.state.tr.setSelection(contentSel).replaceSelection(slice)
  view.dispatch(tr.scrollIntoView())
  event.preventDefault()
  return false
}

// Injectable matchMedia so tests can simulate an OS appearance change
// without a real browser matchMedia; defaults to what production uses.
export function createMermaidPlugin({
  matchMedia = typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia.bind(window) : undefined
} = {}) {
  return new Plugin({
    props: {
      handleKeyDown(view, event) { return handleDiagramArrowKey(view, event) || handleDiagramDeleteKey(view, event) },
      handleDOMEvents: {
        copy: handleDiagramCopy,
        cut: handleDiagramCut,
        paste: handleDiagramPaste
      }
    },
    view(editorView) {
      // WebKit can't place a caret inside zero-size (font-size: 0) text, so
      // it falls back to painting one at the nearest non-collapsed content
      // instead — scoping caret-color to the editor root (not the hidden
      // text itself) is the actual fix, matching this codebase's own
      // .ProseMirror-hideselection convention.
      const syncCaretClass = (v) => {
        const sel = v.state.selection
        let hideCaret = false
        if (sel instanceof TextSelection && sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
          hideCaret = !!diagramBlockAt(v, sel.$from.before(sel.$from.depth))
        }
        v.dom.classList.toggle(HIDE_CARET_CLASS, hideCaret)
      }
      syncCaretClass(editorView)

      const colorSchemeQuery = matchMedia?.('(prefers-color-scheme: dark)')
      const onColorSchemeChange = (e) => {
        mermaid.initialize({ theme: e.matches ? 'dark' : 'default', suppressErrorRendering: true })
        MermaidView.forceRerenderAll()
      }
      colorSchemeQuery?.addEventListener('change', onColorSchemeChange)

      return {
        update: syncCaretClass,
        destroy() { colorSchemeQuery?.removeEventListener('change', onColorSchemeChange) }
      }
    }
  })
}

// A non-mermaid instance can still see its own language change TO mermaid
// later (the Language dialog mutates node.attrs.language on the same node
// identity, so ProseMirror calls update() on the EXISTING instance rather
// than reconsulting the factory) — its own class (CodeView, or another
// plugin's wrapped variant) has no reason to know about mermaid, so this
// wraps whichever instance the delegate chain produced, on the constructed
// object itself, not its class. update() returning false is what tells
// ProseMirror to discard this one instance and ask the factory again — a
// per-node rebuild, not a whole-document redraw.
function wrapForMermaidUpgrade(instance) {
  const delegateUpdate = instance.update.bind(instance)
  instance.update = (node) => isMermaidLanguage(node.attrs.language) ? false : delegateUpdate(node)
  return instance
}

// Delegates to whatever's already installed for code_block, not assumed to
// be CodeView specifically — composable with any other independently-loaded
// code_block NodeView plugin (verified in nodeview-factory-spike.test.js).
export function makeCodeBlockFactory(originalFactory, languageDialog, mermaidViewOptions = {}) {
  return (node, view, getPos) => {
    if (isMermaidLanguage(node.attrs.language)) {
      return new MermaidView(node, view, getPos, languageDialog, mermaidViewOptions)
    }
    return wrapForMermaidUpgrade(originalFactory(node, view, getPos))
  }
}

// On macOS, Cmd+V never reaches the DOM as a paste event at all: NSResponder's
// paste(_:) (MarkupWKWebView.swift) reads NSPasteboard directly and, whenever
// the selection is inside a <pre>, calls MU.pasteCode(text) via
// executeJavaScript — bypassing handleDOMEvents.paste (and this plugin's own
// handleDiagramPaste) entirely. MU.pasteCode itself is a plain
// view.dispatch(view.state.tr.insertText(text)) at the current (collapsed)
// selection, with no notion of "this code_block is atomically selected and
// should have its whole content replaced" — landing the pasted text at the
// very start of a Diagram-mode block's content instead of replacing it.
// Wrapping MU.pasteCode itself (not modifying it in markupeditor-base, which
// has no reason to know about mermaid) catches this regardless of which path
// (native Swift injection or a real DOM paste event, wherever one does still
// fire) invoked it.
export function wrapPasteCodeForDiagram(view) {
  const originalPasteCode = MU.pasteCode
  MU.pasteCode = (text) => {
    const blockPos = selectedDiagramBlockPos(view)
    if (blockPos === null) return originalPasteCode(text)
    const node = view.state.doc.nodeAt(blockPos)
    const from = blockPos + 1
    const to = blockPos + node.nodeSize - 1
    const tr = text ? view.state.tr.replaceWith(from, to, view.state.schema.text(text)) : view.state.tr.delete(from, to)
    view.dispatch(tr.scrollIntoView())
  }
}

const view = MU.activeView()
if (view) {
  adoptMermaidStyles(view)

  const codeBlockFactory = makeCodeBlockFactory(view.props.nodeViews.code_block, MU.languageDialog)
  view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: codeBlockFactory } })
  wrapPasteCodeForDiagram(view)

  const plugin = createMermaidPlugin()
  view.updateState(view.state.reconfigure({ plugins: [plugin, ...view.state.plugins] }))
}
