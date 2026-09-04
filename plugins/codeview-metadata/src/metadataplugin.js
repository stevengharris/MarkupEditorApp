import { MU, Plugin, Selection, TextSelection, NodeSelection, __parseFromClipboard } from "markupeditor"
import metadataStyle from "../styles/metadata.css" with { type: "css" }
import { MetadataView, isMetadataLanguage } from "./metadataview.js"
import { metadataPluginKey } from "./metadatapluginkey.js"

export { isMetadataLanguage }

const HIDE_CARET_CLASS = 'metadata-hide-caret'

export class MetadataPlugin {

    adoptMetadataStyles(view) {
        const root = view.dom.getRootNode()
        if (!root.adoptedStyleSheets?.includes(metadataStyle)) {
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, metadataStyle]
        }
    }

    // Return the MetadataView at pos in the view, or null.
    metadataViewAt(view, pos) {
        const instance = view.nodeDOM(pos)?.codeView
        return instance instanceof MetadataView ? instance : null
    }

    // Table mode is the "atomic" shape (like Mermaid's diagram mode, or
    // HTMLFrontMatterView's rendered mode): contentDOM is present but visually
    // collapsed to nothing, so without this the caret can silently land
    // inside it via arrow-key navigation or typing. Source mode is ordinary
    // text editing and is not atomic.
    tableBlockAt(view, pos) {
        const instance = this.metadataViewAt(view, pos)
        return instance?.mode === 'table' ? instance : null
    }

    // Plain ArrowLeft/ArrowRight treats a Table-mode code_block as a single
    // atomic hop, like an image. Mirrors MermaidPlugin.handleDiagramArrowKey
    // / HTMLFrontMatterPlugin.handleHTMLFrontMatterArrowKey.
    handleMetadataArrowKey(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        const dir = event.key === 'ArrowLeft' ? -1 : 1

        // Already parked on a table block (a NodeSelection) -- arrow away
        // from it to whichever side dir points.
        if (sel instanceof NodeSelection && this.tableBlockAt(view, sel.from)) {
            const targetPos = dir < 0 ? sel.from : sel.to
            if (targetPos < 0 || targetPos > state.doc.content.size) return false
            const newSel = Selection.near(state.doc.resolve(targetPos), dir)
            view.dispatch(state.tr.setSelection(newSel).scrollIntoView())
            return true
        }

        // No "currently inside, hop out" branch here (unlike
        // HTMLFrontMatterPlugin/MermaidPlugin): correctStraySelection (the
        // view-update hook) converts any TextSelection landing inside a
        // Table-mode block to a NodeSelection before any subsequent
        // keydown could observe it as a TextSelection.

        if (!(sel instanceof TextSelection) || !sel.empty) return false

        // ArrowLeft only: landing forward onto a table block (the
        // ArrowRight analog) is unreachable here -- a Table-mode metadata
        // block is always at position 0, so nothing can be positioned
        // before it.
        if (dir > 0) return false
        const targetPos = sel.from + dir
        if (targetPos < 0 || targetPos > state.doc.content.size) return false
        let blockPos = null
        const $target = state.doc.resolve(targetPos)
        if ($target.depth === 0) {
            const before = $target.nodeBefore
            if (before && before.type.name === 'code_block') blockPos = targetPos - before.nodeSize
        }
        if (blockPos === null || !this.tableBlockAt(view, blockPos)) return false
        // Whole-node selection, not a text cursor inside the (hidden)
        // content -- matches how an atomic node like an image behaves.
        // code_block's schema isn't atomic, so this is simulated at the
        // plugin level via NodeSelection.create, which works for any node
        // type regardless of atomicity.
        const newSel = NodeSelection.create(state.doc, blockPos)
        view.dispatch(state.tr.setSelection(newSel).scrollIntoView())
        return true
    }

    // Delete/Backspace on (or adjacent to) a Table-mode block removes the
    // WHOLE block atomically. Mirrors MermaidPlugin.handleDiagramDeleteKey.
    handleMetadataDeleteKey(view, event) {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        // No "currently inside the block's text" branch, and no explicit
        // NodeSelection handling: correctStraySelection already guarantees
        // the selection is never a TextSelection inside a Table-mode
        // block's content, and ProseMirror's default keymap already
        // handles Delete/Backspace on a NodeSelection natively.
        if (!(sel instanceof TextSelection) || !sel.empty) return false

        // Backspace only: "Delete pressed immediately before the block" is
        // unreachable here, same reasoning as handleMetadataArrowKey -- a
        // Table-mode metadata block is always at position 0.
        if (event.key !== 'Backspace') return false
        const targetPos = sel.from - 1
        if (targetPos < 0 || targetPos > state.doc.content.size) return false
        const $target = state.doc.resolve(targetPos)
        if ($target.depth !== 0) return false
        const before = $target.nodeBefore
        if (!before || before.type.name !== 'code_block') return false
        const blockPos = targetPos - before.nodeSize
        if (!this.tableBlockAt(view, blockPos)) return false
        view.dispatch(state.tr.delete(blockPos, targetPos).scrollIntoView())
        return true
    }

    // Catches any route that lands a TextSelection inside a Table-mode
    // block's hidden content -- not just ArrowLeft/Right (handled above),
    // but ArrowUp/Down, Home/End, a mouse click, or anything else
    // ProseMirror's default selection handling might do. Corrects the
    // resulting state after the fact rather than enumerating every
    // possible cause. Called from the view-update hook, which fires on
    // every transaction including pure selection changes, so vertical
    // arrow-key movement is caught the same as horizontal. Returns true if
    // it dispatched a correction, since that dispatch re-triggers this
    // same hook against the corrected state.
    correctStraySelection(view) {
        const sel = view.state.selection
        if (!(sel instanceof TextSelection)) return false
        if (sel.$from.depth === 0 || sel.$from.parent.type.name !== 'code_block') return false
        const blockPos = sel.$from.before(sel.$from.depth)
        if (!this.tableBlockAt(view, blockPos)) return false
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blockPos)))
        return true
    }

    selectedTableBlockPos(view) {
        const sel = view.state.selection
        // Landing on a table block via arrow key creates a NodeSelection
        // (see handleMetadataArrowKey); recognizing it here keeps this
        // plugin's clipboard path explicit rather than relying on
        // ProseMirror's default NodeSelection.content() serialization.
        if (sel instanceof NodeSelection && this.tableBlockAt(view, sel.from)) return sel.from
        if (!(sel instanceof TextSelection) || !sel.empty) return null
        if (sel.$from.depth === 0 || sel.$from.parent.type.name !== 'code_block') return null
        const blockPos = sel.$from.before(sel.$from.depth)
        return this.tableBlockAt(view, blockPos) ? blockPos : null
    }

    // Blocks direct text insertion while a table block is whole-node
    // selected -- "selectable, not editable": without this, ProseMirror's
    // default behavior for typing over a NodeSelection deletes the node and
    // replaces it with the typed text.
    handleMetadataTextInput(view) {
        const sel = view.state.selection
        return sel instanceof NodeSelection && !!this.tableBlockAt(view, sel.from)
    }

    // Writes the whole node to the clipboard, matching MermaidPlugin.handleDiagramCopy
    // / HTMLFrontMatterPlugin.handleHTMLFrontMatterCopy.
    handleMetadataCopy(view, event) {
        const blockPos = this.selectedTableBlockPos(view)
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

    handleMetadataCut(view, event) {
        const blockPos = this.selectedTableBlockPos(view)
        if (blockPos === null) return false
        this.handleMetadataCopy(view, event)
        const node = view.state.doc.nodeAt(blockPos)
        if (node) view.dispatch(view.state.tr.delete(blockPos, blockPos + node.nodeSize).scrollIntoView().setMeta('uiEvent', 'cut'))
        return false
    }

    // Registered via handleDOMEvents.paste, not the handlePaste prop -- same
    // reasoning as MermaidPlugin/HTMLFrontMatterPlugin.
    handleMetadataPaste(view, event) {
        const blockPos = this.selectedTableBlockPos(view)
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

    // On macOS, Cmd+V never reaches the DOM as a paste event when the
    // selection is inside a <pre> -- MarkupWKWebView.swift routes it
    // through MU.pasteCode instead. Wrapping MU.pasteCode catches this
    // regardless of which path fires. Mirrors MermaidPlugin/
    // HTMLFrontMatterPlugin's own wrapper.
    wrapPasteCodeForMetadata(view) {
        const originalPasteCode = MU.pasteCode
        MU.pasteCode = (text) => {
            const blockPos = this.selectedTableBlockPos(view)
            if (blockPos === null) return originalPasteCode(text)
            const node = view.state.doc.nodeAt(blockPos)
            const from = blockPos + 1
            const to = blockPos + node.nodeSize - 1
            const tr = text ? view.state.tr.replaceWith(from, to, view.state.schema.text(text)) : view.state.tr.delete(from, to)
            view.dispatch(tr.scrollIntoView())
        }
    }

    // Delegates to whatever's already installed for code_block, not assumed
    // to be CodeView specifically -- same composability contract
    // HTMLFrontMatterPlugin/MermaidPlugin follow.
    makeCodeBlockFactory(originalFactory, languageDialog) {
        return (node, view, getPos) => {
            if (isMetadataLanguage(node.attrs.language) && getPos() === 0) {
                return new MetadataView(node, view, getPos, languageDialog)
            }
            return this.wrapForMetadataUpgrade(originalFactory(node, view, getPos), getPos)
        }
    }

    // A non-metadata instance can still see a language change TO "metadata"
    // later (the Language dialog / Source-view fence typing mutates
    // node.attrs.language on the same node identity, so ProseMirror calls
    // update() on the existing instance rather than reconsulting the
    // factory). update() returning false tells ProseMirror to discard this
    // instance and ask the factory again, which (now metadata-language,
    // and only if also at position 0) builds a MetadataView. Mirrors
    // HTMLFrontMatterPlugin.wrapForHTMLFrontMatterUpgrade.
    wrapForMetadataUpgrade(instance, getPos) {
        const delegateUpdate = instance.update.bind(instance)
        instance.update = (node) => (isMetadataLanguage(node.attrs.language) && getPos() === 0) ? false : delegateUpdate(node)
        return instance
    }

    createPlugin() {
        return new Plugin({
            key: metadataPluginKey,
            props: {
                handleKeyDown: (view, event) => this.handleMetadataArrowKey(view, event) || this.handleMetadataDeleteKey(view, event),
                handleTextInput: (view) => this.handleMetadataTextInput(view),
                handleDOMEvents: {
                    copy: (view, event) => this.handleMetadataCopy(view, event),
                    cut: (view, event) => this.handleMetadataCut(view, event),
                    paste: (view, event) => this.handleMetadataPaste(view, event)
                }
            },
            state: {
                init: () => ({ collapsed: false }),
                // A whole-document load (MU.setHTML) dispatches its
                // replace-content transaction with addToHistory: false --
                // the only production path that does. Detecting it resets
                // collapse to expanded for the new document, since this
                // Plugin's state persists across document loads and would
                // otherwise carry a prior document's collapse choice into
                // the next one.
                apply: (tr, value) => {
                    if (tr.getMeta('addToHistory') === false) return { collapsed: false }
                    const meta = tr.getMeta(metadataPluginKey)
                    if (meta && typeof meta.collapsed === 'boolean') return { collapsed: meta.collapsed }
                    return value
                }
            },
            // appendTransaction, not view.update: composes the corrective
            // change into the same resulting state as the transaction that
            // tried to make it, so there is never a committed state where
            // the position-0 block's language differs from "metadata".
            // view.update (a separate, later dispatch, the mechanism
            // HTMLFrontMatterPlugin uses for its own weaker position handling)
            // cannot give this guarantee.
            appendTransaction(transactions, oldState, newState) {
                if (!transactions.some(tr => tr.docChanged)) return null
                const oldFirst = oldState.doc.firstChild
                const wasMetadata = oldFirst && oldFirst.type.name === 'code_block' && isMetadataLanguage(oldFirst.attrs.language)
                if (!wasMetadata) return null
                const first = newState.doc.firstChild
                if (!first || first.type.name !== 'code_block') return null // deletion/displacement -- not this guard's concern
                if (isMetadataLanguage(first.attrs.language)) return null
                return newState.tr.setNodeMarkup(0, undefined, { ...first.attrs, language: 'metadata' })
            },
            view: (editorView) => {
                // Hides the native caret whenever the selection is inside a
                // Table-mode block's (invisible) contentDOM --
                // belt-and-suspenders alongside the arrow-key/delete
                // handling above, for a selection that lands there some
                // other way (e.g. a mouse click). Mirrors MermaidPlugin/
                // HTMLFrontMatterPlugin.
                const syncCaretClass = (v) => {
                    const sel = v.state.selection
                    let hideCaret = false
                    if (sel instanceof TextSelection && sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
                        hideCaret = !!this.tableBlockAt(v, sel.$from.before(sel.$from.depth))
                    }
                    v.dom.classList.toggle(HIDE_CARET_CLASS, hideCaret)
                }
                // Runs on every transaction, unlike a NodeView's own
                // update() -- the actual position-0 enforcement mechanism.
                // Also syncs collapse-state chrome across live instances,
                // since a meta-only transaction (the bar's click handler)
                // touches no document content and so never reaches any
                // NodeView's update() either.
                const onUpdate = (v) => {
                    // Dispatches (and returns true) if it corrects a stray
                    // selection -- that dispatch re-enters this hook
                    // against the corrected state, so the rest of this
                    // pass would be redoing work against a state about to
                    // change.
                    if (this.correctStraySelection(v)) return
                    syncCaretClass(v)
                    MetadataView.checkAllPositions()
                    MetadataView.syncAllCollapsedState()
                    // codeLanguageTabPlugin's setActive callback is
                    // TextSelection-inside-only per its own doc comment,
                    // never a NodeSelection -- exactly the kind a
                    // Table-mode block now creates, so the selected
                    // outline is driven directly from live selection state
                    // here instead.
                    MetadataView.syncAllSelectedState(v.state)
                }
                // Also run once at construction: covers the case where the
                // document's initial/default selection on load already
                // lands inside a table block.
                if (!this.correctStraySelection(editorView)) {
                    syncCaretClass(editorView)
                    MetadataView.syncAllSelectedState(editorView.state)
                }
                return { update: onUpdate }
            }
        })
    }

    // Wires this plugin into the active editor view: adopts the metadata
    // stylesheet, installs the code_block NodeView factory override, and
    // adds the position/guard/collapse-state Plugin to the editor state.
    // Deliberately does not call MU.registerPlugin -- keeping "metadata"
    // out of isRecognizedLanguage is what keeps it out of the toolbar's
    // Code Language submenu.
    install() {
        const view = MU.activeView()
        if (!view) return

        this.adoptMetadataStyles(view)

        const codeBlockFactory = this.makeCodeBlockFactory(view.props.nodeViews.code_block, MU.languageDialog)
        view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: codeBlockFactory } })
        this.wrapPasteCodeForMetadata(view)

        const plugin = this.createPlugin()
        view.updateState(view.state.reconfigure({ plugins: [plugin, ...view.state.plugins] }))
    }
}

export const metadataPlugin = new MetadataPlugin()

metadataPlugin.install()
