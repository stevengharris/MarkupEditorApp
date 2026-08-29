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
    // FrontMatterView's rendered mode) -- contentDOM is present but visually
    // collapsed to nothing (font-size/line-height: 0), so without this the
    // caret can silently land inside it: arrow-key navigation drops the user
    // into invisible text, and typing there updates the code_block's real
    // content while Table is still showing, producing exactly the "both
    // Table and Source visible at once" symptom this plugin's keyboard/
    // clipboard handling exists to prevent. Source mode is ordinary text
    // editing and is NOT atomic.
    tableBlockAt(view, pos) {
        const instance = this.metadataViewAt(view, pos)
        return instance?.mode === 'table' ? instance : null
    }

    // Plain ArrowLeft/ArrowRight treats a Table-mode code_block as a single
    // atomic hop, like an image. Mirrors MermaidPlugin.handleDiagramArrowKey
    // / FrontMatterPlugin.handleFrontMatterArrowKey.
    handleMetadataArrowKey(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        const dir = event.key === 'ArrowLeft' ? -1 : 1

        // Already parked ON a table block (a NodeSelection -- see the landing
        // case below) -- arrow away from it to whichever side dir points.
        if (sel instanceof NodeSelection && this.tableBlockAt(view, sel.from)) {
            const targetPos = dir < 0 ? sel.from : sel.to
            if (targetPos < 0 || targetPos > state.doc.content.size) return false
            const newSel = Selection.near(state.doc.resolve(targetPos), dir)
            view.dispatch(state.tr.setSelection(newSel).scrollIntoView())
            return true
        }

        // No "currently inside the block's text, hop out" branch here (unlike
        // FrontMatterPlugin/MermaidPlugin, which need one): correctStraySelection
        // (the Plugin's view-update hook) converts any TextSelection that lands
        // inside a Table-mode block's content to a NodeSelection on the very
        // transaction that puts it there, before any subsequent keydown could
        // ever observe it as a TextSelection -- so that case is unreachable here.

        if (!(sel instanceof TextSelection) || !sel.empty) return false

        // ArrowLeft only: landing FORWARD onto a table block from something positioned
        // before it (the dir > 0 / ArrowRight analog) is unreachable for MetadataView
        // specifically -- unlike Mermaid/FrontMatter, which can appear anywhere in the
        // document, a Table-mode metadata block is always at position 0 (tableBlockAt
        // requires getPos() === 0), so nothing can ever be positioned before it.
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
        // Whole-node selection, not a text cursor inside the (hidden) content: selectable,
        // not directly editable, matching how an atomic node like an image behaves.
        // code_block's schema isn't atomic (Source mode needs real editable text), so this
        // is simulated at the plugin level -- NodeSelection.create works for any node type
        // regardless of atomicity, unlike Selection.near, which always prefers a text
        // position when one exists (why the "hop out" branch above still needs
        // TextSelection handling -- that's leaving an existing text cursor, not landing).
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
        // No "currently inside the block's text" branch, and no explicit NodeSelection
        // handling either: correctStraySelection already guarantees the selection is
        // never a TextSelection inside a Table-mode block's content by the time this
        // runs (see handleMetadataArrowKey's comment), and ProseMirror's own default
        // keymap already handles Delete/Backspace on a NodeSelection natively (deletes
        // the selected node) -- falling through (returning false below) is correct.
        if (!(sel instanceof TextSelection) || !sel.empty) return false

        // Backspace only: "Delete pressed immediately before the block" (the forward
        // analog) is unreachable for MetadataView specifically, same reasoning as
        // handleMetadataArrowKey's dir > 0 case -- a Table-mode metadata block is
        // always at position 0, so nothing can ever be positioned before it.
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

    // Catches ANY route that lands a TextSelection inside a Table-mode block's
    // hidden content -- not just ArrowLeft/Right (handled proactively above),
    // but ArrowUp/Down, Home/End, a mouse click into the zero-size hidden
    // text, or anything else ProseMirror's own default selection handling
    // might do that this plugin doesn't explicitly intercept. Corrects the
    // resulting STATE after the fact rather than trying to enumerate every
    // possible cause -- the same philosophy MetadataPlugin's appendTransaction
    // guard already uses for the language attribute. Called from the view
    // -update hook, which fires on every transaction including pure
    // selection changes (no doc change required), so vertical arrow-key
    // movement (computed from DOM layout, not something this plugin can
    // easily predict/intercept proactively) is caught just as reliably as
    // horizontal. Returns true if it dispatched a correction -- the
    // dispatch re-triggers this same update hook against the corrected
    // state, so the caller should skip its own (now-stale) sync work.
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
        // The normal case now: landing on a table block via arrow key creates a
        // NodeSelection (see handleMetadataArrowKey) -- ProseMirror's own default
        // copy/cut would actually handle this correctly without any of the
        // methods below (NodeSelection.content() already serializes the whole
        // node), but recognizing it here keeps this plugin's own clipboard path
        // uniform and explicit rather than depending on that default silently
        // continuing to do the right thing.
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
    // / FrontMatterPlugin.handleFrontMatterCopy.
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
    // reasoning as MermaidPlugin/FrontMatterPlugin.
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

    // On macOS, Cmd+V never reaches the DOM as a paste event when the selection is
    // inside a <pre> (MarkupWKWebView.swift routes it through MU.pasteCode instead) --
    // wrapping MU.pasteCode itself catches this regardless of which path fires.
    // Mirrors MermaidPlugin.wrapPasteCodeForDiagram / FrontMatterPlugin.wrapPasteCodeForFrontMatter.
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
    // FrontMatterPlugin/MermaidPlugin follow.
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
    // node.attrs.language on the SAME node identity, so ProseMirror calls
    // update() on the EXISTING instance rather than reconsulting the
    // factory) -- this is the deliberate bootstrap-creation path AC8
    // describes. Mirrors FrontMatterPlugin.wrapForFrontMatterUpgrade.
    // update() returning false tells ProseMirror to discard this instance
    // and ask the factory again, which (now metadata-language, and only if
    // also at position 0) builds a MetadataView.
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
                // the only production path that does. Detecting it here
                // resets collapse to expanded for the new document, since
                // this Plugin's own state persists across document loads
                // (setHTML replaces content via a transaction on the
                // existing EditorState, not a fresh EditorState.create) and
                // would otherwise carry a prior document's collapse choice
                // into the next one.
                apply: (tr, value) => {
                    if (tr.getMeta('addToHistory') === false) return { collapsed: false }
                    const meta = tr.getMeta(metadataPluginKey)
                    if (meta && typeof meta.collapsed === 'boolean') return { collapsed: meta.collapsed }
                    return value
                }
            },
            // appendTransaction, not view.update: composes the corrective
            // change into the SAME resulting state as the transaction that
            // tried to make it, so there is never a committed state (one a
            // concurrent save could observe) where the position-0 block's
            // language differs from "metadata". Confirmed via a standalone
            // spike against a minimal schema before this was built --
            // view.update (a separate, later
            // dispatch, the mechanism FrontMatterPlugin uses for its own,
            // weaker "reversible but not atomic" position handling) cannot
            // give this guarantee.
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
                // Hides the native caret whenever the selection is inside a Table-mode
                // block's (invisible) contentDOM -- belt-and-suspenders alongside the
                // arrow-key/delete handling above: those prevent the selection from
                // landing there via keyboard navigation, this hides any caret that
                // still ends up there some other way (e.g. a mouse click into the
                // zero-size hidden text). Mirrors MermaidPlugin/FrontMatterPlugin.
                const syncCaretClass = (v) => {
                    const sel = v.state.selection
                    let hideCaret = false
                    if (sel instanceof TextSelection && sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
                        hideCaret = !!this.tableBlockAt(v, sel.$from.before(sel.$from.depth))
                    }
                    v.dom.classList.toggle(HIDE_CARET_CLASS, hideCaret)
                }
                // Runs on EVERY transaction, unlike a NodeView's own
                // update() -- the actual position-0 enforcement mechanism,
                // same reasoning as FrontMatterPlugin's onUpdate. Also
                // syncs collapse-state chrome across live instances, since
                // a meta-only transaction (the bar's own click handler)
                // touches no document content and so never reaches any
                // NodeView's update() either.
                const onUpdate = (v) => {
                    // Dispatches (and returns true) if it corrects a stray selection --
                    // that dispatch re-enters this same hook against the corrected
                    // state, so the rest of this pass would just be redoing work
                    // against a state that's about to change anyway.
                    if (this.correctStraySelection(v)) return
                    syncCaretClass(v)
                    MetadataView.checkAllPositions()
                    MetadataView.syncAllCollapsedState()
                    // codeLanguageTabPlugin's setActive callback (CodeView's usual
                    // selected-instance signal) is TextSelection-inside-only per its own
                    // doc comment, never a NodeSelection -- exactly the selection kind
                    // landing on a Table-mode block now creates, so the selected outline
                    // is driven directly from live selection state here instead.
                    MetadataView.syncAllSelectedState(v.state)
                }
                // Also run once at construction, not just on subsequent transactions --
                // covers the (currently unhandled, separately tracked) case where the
                // document's own initial/default selection on load already happens to
                // land inside a table block, same as onUpdate would catch afterward.
                if (!this.correctStraySelection(editorView)) {
                    syncCaretClass(editorView)
                    MetadataView.syncAllSelectedState(editorView.state)
                }
                return { update: onUpdate }
            }
        })
    }

    // Wires this plugin into the currently active editor view: adopts the
    // metadata stylesheet, installs the code_block NodeView factory
    // override, and adds the position/guard/collapse-state Plugin to the
    // editor state. Deliberately does NOT call MU.registerPlugin -- keeping
    // "metadata" out of isRecognizedLanguage is what keeps it out of the
    // toolbar's Code Language submenu.
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
