import { MU, Plugin, Selection, TextSelection, NodeSelection, __parseFromClipboard } from "markupeditor"
import frontMatterStyle from "../styles/frontmatter.css" with { type: "css" }
import { FrontMatterView, isFrontMatterLanguage, expectedPreamblePosition } from "./frontmatterview.js"

export { isFrontMatterLanguage }

const HIDE_CARET_CLASS = 'frontmatter-hide-caret'

export class FrontMatterPlugin {

    // Add the frontmatter css to the root node
    adoptFrontMatterStyles(view) {
        const root = view.dom.getRootNode()
        if (!root.adoptedStyleSheets?.includes(frontMatterStyle)) {
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, frontMatterStyle]
        }
    }

    // Return the FrontMatterView at the pos in the view
    frontMatterViewAt(view, pos) {
        const instance = view.nodeDOM(pos)?.codeView
        return instance instanceof FrontMatterView ? instance : null
    }

    // If we are looking at rendered HTML as opposed to source, return the FrontMatterView
    renderedBlockAt(view, pos) {
        const instance = this.frontMatterViewAt(view, pos)
        return instance?.mode === 'rendered' ? instance : null
    }

    // Plain ArrowLeft/ArrowRight treats a Rendered-mode code_block as a single
    // atomic hop, like an image: arrowing in lands on the canonical position.
    // Mirrors MermaidPlugin.handleDiagramArrowKey.
    handleFrontMatterArrowKey(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return false
        const dir = event.key === 'ArrowLeft' ? -1 : 1

        if (sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
            const blockPos = sel.$from.before(sel.$from.depth)
            if (this.renderedBlockAt(view, blockPos)) {
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
        if (blockPos === null || !this.renderedBlockAt(view, blockPos)) return false
        const newSel = Selection.near(state.doc.resolve(blockPos + 1))
        view.dispatch(state.tr.setSelection(newSel).scrollIntoView())
        return true
    }

    // Delete/Backspace on (or adjacent to) a Rendered-mode block removes the
    // WHOLE block atomically. Mirrors MermaidPlugin.handleDiagramDeleteKey.
    handleFrontMatterDeleteKey(view, event) {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return false
        const dir = event.key === 'Backspace' ? -1 : 1

        if (sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
            const blockPos = sel.$from.before(sel.$from.depth)
            const node = this.renderedBlockAt(view, blockPos) && state.doc.nodeAt(blockPos)
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
            if (!this.renderedBlockAt(view, blockPos)) return false
            view.dispatch(state.tr.delete(blockPos, targetPos).scrollIntoView())
            return true
        } else {
            const node = state.doc.nodeAt(targetPos)
            if (!node || node.type.name !== 'code_block') return false
            if (!this.renderedBlockAt(view, targetPos)) return false
            view.dispatch(state.tr.delete(targetPos, targetPos + node.nodeSize).scrollIntoView())
            return true
        }
    }

    selectedRenderedBlockPos(view) {
        const sel = view.state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return null
        if (sel.$from.depth === 0 || sel.$from.parent.type.name !== 'code_block') return null
        const blockPos = sel.$from.before(sel.$from.depth)
        return this.renderedBlockAt(view, blockPos) ? blockPos : null
    }

    // Writes the whole node to the clipboard, matching MermaidPlugin.handleDiagramCopy.
    handleFrontMatterCopy(view, event) {
        const blockPos = this.selectedRenderedBlockPos(view)
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

    handleFrontMatterCut(view, event) {
        const blockPos = this.selectedRenderedBlockPos(view)
        if (blockPos === null) return false
        this.handleFrontMatterCopy(view, event)
        const node = view.state.doc.nodeAt(blockPos)
        if (node) view.dispatch(view.state.tr.delete(blockPos, blockPos + node.nodeSize).scrollIntoView().setMeta('uiEvent', 'cut'))
        return false
    }

    // Registered via handleDOMEvents.paste, not the handlePaste prop -- same
    // reasoning as MermaidPlugin.handleDiagramPaste.
    handleFrontMatterPaste(view, event) {
        const blockPos = this.selectedRenderedBlockPos(view)
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
                handleKeyDown: (view, event) => this.handleFrontMatterArrowKey(view, event) || this.handleFrontMatterDeleteKey(view, event),
                handleDOMEvents: {
                    copy: (view, event) => this.handleFrontMatterCopy(view, event),
                    cut: (view, event) => this.handleFrontMatterCut(view, event),
                    paste: (view, event) => this.handleFrontMatterPaste(view, event)
                }
            },
            view: (editorView) => {
                const syncCaretClass = (v) => {
                    const sel = v.state.selection
                    let hideCaret = false
                    if (sel instanceof TextSelection && sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
                        hideCaret = !!this.renderedBlockAt(v, sel.$from.before(sel.$from.depth))
                    }
                    v.dom.classList.toggle(HIDE_CARET_CLASS, hideCaret)
                }
                // Runs on EVERY transaction, unlike a NodeView's own
                // update() -- the actual position-0 enforcement mechanism.
                // See FrontMatterView's class doc comment: a pure position
                // shift (no attrs/content change on the code_block itself)
                // never triggers a NodeView-level update() call at all, so
                // enforcement has to live here instead.
                const onUpdate = (v) => {
                    syncCaretClass(v)
                    FrontMatterView.checkAllPositions()
                }
                syncCaretClass(editorView)
                return { update: onUpdate }
            }
        })
    }

    // A non-frontmatter instance can still see a language change TO html
    // later (the Language dialog mutates node.attrs.language on the same
    // node identity, so ProseMirror calls update() on the EXISTING
    // instance rather than reconsulting the factory) -- mirrors
    // MermaidPlugin.wrapForMermaidUpgrade, plus the leading-position check this
    // plugin additionally needs. getPos is captured from
    // makeCodeBlockFactory's own closure (not read off instance) since a
    // plain CodeView is not guaranteed to expose it as a property the way
    // FrontMatterView does. update() returning false is what tells
    // ProseMirror to discard this one instance and ask the factory again.
    wrapForFrontMatterUpgrade(instance, view, getPos) {
        const delegateUpdate = instance.update.bind(instance)
        instance.update = (node) => (isFrontMatterLanguage(node.attrs.language) && getPos() === expectedPreamblePosition(view.state.doc)) ? false : delegateUpdate(node)
        return instance
    }

    // Delegates to whatever's already installed for code_block, not assumed
    // to be CodeView specifically -- the same capture-wrap-delegate
    // composability contract MermaidPlugin follows, so independently
    // authored language-specific plugins can layer factories regardless of
    // load order.
    // The leading-position check (expectedPreamblePosition -- 0 normally, or right
    // after it when a metadata block occupies position 0) happens here, at factory time; ongoing
    // enforcement as the document is edited is FrontMatterView.
    // checkAllPositions(), not this factory (see that class's doc comment
    // for why a NodeView's own update() can't be relied on for a pure
    // position shift).
    makeCodeBlockFactory(originalFactory, languageDialog, frontMatterViewOptions = {}) {
        return (node, view, getPos) => {
            if (isFrontMatterLanguage(node.attrs.language) && getPos() === expectedPreamblePosition(view.state.doc)) {
                return new FrontMatterView(node, view, getPos, languageDialog, frontMatterViewOptions)
            }
            return this.wrapForFrontMatterUpgrade(originalFactory(node, view, getPos), view, getPos)
        }
    }

    // On macOS, Cmd+V never reaches the DOM as a paste event at all: NSResponder's
    // paste(_:) (MarkupWKWebView.swift) reads NSPasteboard directly and, whenever
    // the selection is inside a <pre>, calls MU.pasteCode(text) via
    // executeJavaScript -- bypassing handleDOMEvents.paste (and
    // handleFrontMatterPaste) entirely. MU.pasteCode itself is a plain
    // view.dispatch(view.state.tr.insertText(text)) at the current (collapsed)
    // selection, with no notion of "this code_block is atomically selected and
    // should have its whole content replaced" -- landing the pasted text at the
    // very start of a Rendered-mode block's content instead of replacing it.
    // Wrapping MU.pasteCode itself (not modifying it in markupeditor-base, which
    // has no reason to know about front matter) catches this regardless of which
    // path (native Swift injection or a real DOM paste event, wherever one does
    // still fire) invoked it. Mirrors MermaidPlugin.wrapPasteCodeForDiagram.
    wrapPasteCodeForFrontMatter(view) {
        const originalPasteCode = MU.pasteCode
        MU.pasteCode = (text) => {
            const blockPos = this.selectedRenderedBlockPos(view)
            if (blockPos === null) return originalPasteCode(text)
            const node = view.state.doc.nodeAt(blockPos)
            const from = blockPos + 1
            const to = blockPos + node.nodeSize - 1
            const tr = text ? view.state.tr.replaceWith(from, to, view.state.schema.text(text)) : view.state.tr.delete(from, to)
            view.dispatch(tr.scrollIntoView())
        }
    }

    // Wires this plugin into the currently active editor view: adopts the
    // frontmatter stylesheet, installs the code_block NodeView factory
    // override, wraps MU.pasteCode, registers with markupeditor-base's
    // plugin registry, and adds the keyboard/clipboard Plugin to the
    // editor state.
    install() {
        const view = MU.activeView()
        if (!view) return

        this.adoptFrontMatterStyles(view)

        const codeBlockFactory = this.makeCodeBlockFactory(view.props.nodeViews.code_block, MU.languageDialog)
        view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: codeBlockFactory } })
        this.wrapPasteCodeForFrontMatter(view)

        // We need to register the codeview plugin so that isRecognizedLanguage returns
        // true when used in the LanguageDialogItem of markupeditor-base
        MU.registerPlugin({ name: 'FrontMatter', type: 'codeview' })

        const plugin = this.createPlugin()
        view.updateState(view.state.reconfigure({ plugins: [plugin, ...view.state.plugins] }))
    }
}

export const frontMatterPlugin = new FrontMatterPlugin()

frontMatterPlugin.install()
