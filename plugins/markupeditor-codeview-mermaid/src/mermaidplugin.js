import { MU, Plugin, Selection, TextSelection, NodeSelection, __parseFromClipboard } from "markupeditor"
import mermaid from "mermaid"
import mermaidStyle from "../styles/mermaid.css" with { type: "css" }
import { MermaidView, isMermaidLanguage } from "./mermaidview.js"

export { isMermaidLanguage }

const HIDE_CARET_CLASS = 'mermaid-hide-caret'

export class MermaidPlugin {

    constructor() {
        this.prefersDark = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches
        // mermaid's render(id, text) (no container arg — our usage) appends a
        // temp element to document.body even on a parse error, and rethrows before
        // that cleanup runs; suppressErrorRendering takes an early cleanup path
        // instead. We show a Source-mode fallback on error and don't want
        // the mermaid error SVG anyway.
        mermaid.initialize({ theme: this.prefersDark ? 'dark' : 'default', suppressErrorRendering: true })
    }

    // Add the mermaid css to the root node
    adoptMermaidStyles(view) {
        const root = view.dom.getRootNode()
        if (!root.adoptedStyleSheets?.includes(mermaidStyle)) {
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, mermaidStyle]
        }
    }

    // Return the MermaidView at the pos in the view
    mermaidViewAt(view, pos) {
        const instance = view.nodeDOM(pos)?.codeView
        return instance instanceof MermaidView ? instance : null
    }

    // If we are looking at a mermaid diagram as opposed to source, return the MermaidView
    diagramBlockAt(view, pos) {
        const instance = this.mermaidViewAt(view, pos)
        return instance?.mode === 'diagram' ? instance : null
    }

    // Plain ArrowLeft/ArrowRight treats a Diagram-mode code_block as a single
    // atomic hop, like an image: arrowing in lands on the canonical position.
    // Unlike an image, which uses NodeSelection, the selection here is a TextSelection.
    // We need special handling so that the navigation around a diagram behaves
    // like you would expect - selection of the diagram itself, not some text hidden
    // "behind" it.
    handleDiagramArrowKey(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return false
        const dir = event.key === 'ArrowLeft' ? -1 : 1

        if (sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
            const blockPos = sel.$from.before(sel.$from.depth)
            if (this.diagramBlockAt(view, blockPos)) {
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
        if (blockPos === null || !this.diagramBlockAt(view, blockPos)) return false
        const newSel = Selection.near(state.doc.resolve(blockPos + 1))
        view.dispatch(state.tr.setSelection(newSel).scrollIntoView())
        return true
    }

    // Delete/Backspace on (or adjacent to) a Diagram-mode block removes the
    // WHOLE block atomically, like a selected image — not a single character of
    // its collapsed, invisible source text. This only applies when there's no
    // other node-level content to fall back to: if the cursor's own block is
    // ALSO a code_block, the normal join-with-previous (or delete-if-empty)
    // keymap behavior already does the right thing -- including keeping the
    // surviving block's language, mermaid or otherwise -- and must run
    // instead of this atomic delete short-circuiting it.
    handleDiagramDeleteKey(view, event) {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return false
        const dir = event.key === 'Backspace' ? -1 : 1

        if (sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
            const blockPos = sel.$from.before(sel.$from.depth)
            const node = this.diagramBlockAt(view, blockPos) && state.doc.nodeAt(blockPos)
            if (node) {
                view.dispatch(state.tr.delete(blockPos, blockPos + node.nodeSize).scrollIntoView())
                return true
            }
        }

        if (sel.$from.parent.type.name === 'code_block') return false

        const targetPos = sel.from + dir
        if (targetPos < 0 || targetPos > state.doc.content.size) return false
        if (dir < 0) {
            const $target = state.doc.resolve(targetPos)
            if ($target.depth !== 0) return false
            const before = $target.nodeBefore
            if (!before || before.type.name !== 'code_block') return false
            const blockPos = targetPos - before.nodeSize
            if (!this.diagramBlockAt(view, blockPos)) return false
            view.dispatch(state.tr.delete(blockPos, targetPos).scrollIntoView())
            return true
        } else {
            const node = state.doc.nodeAt(targetPos)
            if (!node || node.type.name !== 'code_block') return false
            if (!this.diagramBlockAt(view, targetPos)) return false
            view.dispatch(state.tr.delete(targetPos, targetPos + node.nodeSize).scrollIntoView())
            return true
        }
    }

    selectedDiagramBlockPos(view) {
        const sel = view.state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return null
        if (sel.$from.depth === 0 || sel.$from.parent.type.name !== 'code_block') return null
        const blockPos = sel.$from.before(sel.$from.depth)
        return this.diagramBlockAt(view, blockPos) ? blockPos : null
    }

    // Writes the whole node to the clipboard via view.serializeForClipboard, the
    // same method prosemirror-view's native copy handler uses on a real
    // NodeSelection's content() — needed here because the "selected" position is
    // a collapsed TextSelection (see handleDiagramArrowKey), which that internal
    // handler bails out of immediately.
    handleDiagramCopy(view, event) {
        const blockPos = this.selectedDiagramBlockPos(view)
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

    handleDiagramCut(view, event) {
        const blockPos = this.selectedDiagramBlockPos(view)
        if (blockPos === null) return false
        this.handleDiagramCopy(view, event)
        const node = view.state.doc.nodeAt(blockPos)
        if (node) view.dispatch(view.state.tr.delete(blockPos, blockPos + node.nodeSize).scrollIntoView().setMeta('uiEvent', 'cut'))
        return false
    }

    // Registered via handleDOMEvents.paste, not the handlePaste prop:
    // EditorView.someProp checks direct view props (where markupeditor-base's
    // own generic code_block handlePaste lives) before any plugin's, so a
    // plugin-level handlePaste here would never actually run first.
    handleDiagramPaste(view, event) {
        const blockPos = this.selectedDiagramBlockPos(view)
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

    createPlugin() {
        return new Plugin({
            props: {
                handleKeyDown: (view, event) => this.handleDiagramArrowKey(view, event) || this.handleDiagramDeleteKey(view, event),
                handleDOMEvents: {
                    copy: (view, event) => this.handleDiagramCopy(view, event),
                    cut: (view, event) => this.handleDiagramCut(view, event),
                    paste: (view, event) => this.handleDiagramPaste(view, event)
                }
            },
            view: (editorView) => {
                // WebKit can't place a caret inside zero-size (font-size: 0) text, so
                // it falls back to painting one at the nearest non-collapsed content
                // instead — scoping caret-color to the editor root (not the hidden
                // text itself) is the actual fix, matching the
                // .ProseMirror-hideselection convention used elsewhere in this codebase.
                const syncCaretClass = (v) => {
                    const sel = v.state.selection
                    let hideCaret = false
                    if (sel instanceof TextSelection && sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
                        hideCaret = !!this.diagramBlockAt(v, sel.$from.before(sel.$from.depth))
                    }
                    v.dom.classList.toggle(HIDE_CARET_CLASS, hideCaret)
                }
                syncCaretClass(editorView)

                const colorSchemeQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : undefined
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

    // A non-mermaid instance can still see a language change TO mermaid
    // later (the Language dialog mutates node.attrs.language on the same node
    // identity, so ProseMirror calls update() on the EXISTING instance rather
    // than reconsulting the factory) — the instance's class (CodeView, or another
    // plugin's wrapped variant) has no reason to know about mermaid, so this
    // wraps whichever instance the delegate chain produced, on the constructed
    // object itself, not its class. update() returning false is what tells
    // ProseMirror to discard this one instance and ask the factory again — a
    // per-node rebuild, not a whole-document redraw.
    wrapForMermaidUpgrade(instance) {
        const delegateUpdate = instance.update.bind(instance)
        instance.update = (node) => isMermaidLanguage(node.attrs.language) ? false : delegateUpdate(node)
        return instance
    }

    // Delegates to whatever's already installed for code_block, not assumed to
    // be CodeView specifically — composable with any other independently-loaded
    // code_block NodeView plugin (verified in nodeview-factory-spike.test.js).
    makeCodeBlockFactory(originalFactory, languageDialog, mermaidViewOptions = {}) {
        return (node, view, getPos) => {
            if (isMermaidLanguage(node.attrs.language)) {
                return new MermaidView(node, view, getPos, languageDialog, mermaidViewOptions)
            }
            return this.wrapForMermaidUpgrade(originalFactory(node, view, getPos))
        }
    }

    // On macOS, Cmd+V never reaches the DOM as a paste event at all: NSResponder's
    // paste(_:) (MarkupWKWebView.swift) reads NSPasteboard directly and, whenever
    // the selection is inside a <pre>, calls MU.pasteCode(text) via
    // executeJavaScript — bypassing handleDOMEvents.paste (and handleDiagramPaste)
    // entirely. MU.pasteCode itself is a plain
    // view.dispatch(view.state.tr.insertText(text)) at the current (collapsed)
    // selection, with no notion of "this code_block is atomically selected and
    // should have its whole content replaced" — landing the pasted text at the
    // very start of a Diagram-mode block's content instead of replacing it.
    // Wrapping MU.pasteCode itself (not modifying it in markupeditor-base, which
    // has no reason to know about mermaid) catches this regardless of which path
    // (native Swift injection or a real DOM paste event, wherever one does still
    // fire) invoked it.
    wrapPasteCodeForDiagram(view) {
        const originalPasteCode = MU.pasteCode
        MU.pasteCode = (text) => {
            const blockPos = this.selectedDiagramBlockPos(view)
            if (blockPos === null) return originalPasteCode(text)
            const node = view.state.doc.nodeAt(blockPos)
            const from = blockPos + 1
            const to = blockPos + node.nodeSize - 1
            const tr = text ? view.state.tr.replaceWith(from, to, view.state.schema.text(text)) : view.state.tr.delete(from, to)
            view.dispatch(tr.scrollIntoView())
        }
    }

    // Wires this plugin into the currently active editor view: adopts the
    // mermaid stylesheet, installs the code_block NodeView factory override,
    // wraps MU.pasteCode, registers with markupeditor-base's plugin registry,
    // and adds the keyboard/clipboard/theme Plugin to the editor state.
    install() {
        const view = MU.activeView()
        if (!view) return

        this.adoptMermaidStyles(view)

        const codeBlockFactory = this.makeCodeBlockFactory(view.props.nodeViews.code_block, MU.languageDialog)
        view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: codeBlockFactory } })
        this.wrapPasteCodeForDiagram(view)

        // We need to register the codeview plugin so that isRecognizedLanguage returns
        // true when used in the LanguageDialogItem of markupeditor-base
        MU.registerPlugin({ name: 'Mermaid', type: 'codeview' })

        const plugin = this.createPlugin()
        view.updateState(view.state.reconfigure({ plugins: [plugin, ...view.state.plugins] }))
    }
}

export const mermaidPlugin = new MermaidPlugin()

mermaidPlugin.install()
