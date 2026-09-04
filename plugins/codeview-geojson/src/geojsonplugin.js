import { MU, Plugin, Selection, TextSelection, NodeSelection, __parseFromClipboard } from "markupeditor"
import geojsonStyle from "../styles/geojson.css" with { type: "css" }
import leafletStyle from "leaflet/dist/leaflet.css" with { type: "css" }
import { GeoJSONView, isGeojsonLanguage } from "./geojsonview.js"

export { isGeojsonLanguage }

const HIDE_CARET_CLASS = 'geojson-hide-caret'

export class GeoJSONPlugin {

    // Add the geojson and leaflet css to the root node. A plain document.head
    // <style> injection would not reach the editor's content, which lives in
    // a Shadow DOM -- adoptedStyleSheets on the real root is required.
    adoptGeoJSONStyles(view) {
        const root = view.dom.getRootNode()
        for (const style of [geojsonStyle, leafletStyle]) {
            if (!root.adoptedStyleSheets?.includes(style)) {
                root.adoptedStyleSheets = [...root.adoptedStyleSheets, style]
            }
        }
    }

    // Return the GeoJSONView at the pos in the view
    geojsonViewAt(view, pos) {
        const instance = view.nodeDOM(pos)?.codeView
        return instance instanceof GeoJSONView ? instance : null
    }

    // If we are looking at a rendered map as opposed to source, return the GeoJSONView
    mapBlockAt(view, pos) {
        const instance = this.geojsonViewAt(view, pos)
        return instance?.mode === 'map' ? instance : null
    }

    // Plain ArrowLeft/ArrowRight treats a Map-mode code_block as a single
    // atomic hop, like an image: arrowing in lands on the canonical position.
    // Mirrors MermaidPlugin.handleDiagramArrowKey.
    handleMapArrowKey(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return false
        const dir = event.key === 'ArrowLeft' ? -1 : 1

        if (sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
            const blockPos = sel.$from.before(sel.$from.depth)
            if (this.mapBlockAt(view, blockPos)) {
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
        if (blockPos === null || !this.mapBlockAt(view, blockPos)) return false
        const newSel = Selection.near(state.doc.resolve(blockPos + 1))
        view.dispatch(state.tr.setSelection(newSel).scrollIntoView())
        return true
    }

    // Delete/Backspace on (or adjacent to) a Map-mode block removes the WHOLE
    // block atomically. Mirrors MermaidPlugin.handleDiagramDeleteKey, including
    // deferring to normal join/delete-if-empty when the cursor's own block is
    // also a code_block.
    handleMapDeleteKey(view, event) {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view
        const sel = state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return false
        const dir = event.key === 'Backspace' ? -1 : 1

        if (sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
            const blockPos = sel.$from.before(sel.$from.depth)
            const node = this.mapBlockAt(view, blockPos) && state.doc.nodeAt(blockPos)
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
            if (!this.mapBlockAt(view, blockPos)) return false
            view.dispatch(state.tr.delete(blockPos, targetPos).scrollIntoView())
            return true
        } else {
            const node = state.doc.nodeAt(targetPos)
            if (!node || node.type.name !== 'code_block') return false
            if (!this.mapBlockAt(view, targetPos)) return false
            view.dispatch(state.tr.delete(targetPos, targetPos + node.nodeSize).scrollIntoView())
            return true
        }
    }

    selectedMapBlockPos(view) {
        const sel = view.state.selection
        if (!(sel instanceof TextSelection) || !sel.empty) return null
        if (sel.$from.depth === 0 || sel.$from.parent.type.name !== 'code_block') return null
        const blockPos = sel.$from.before(sel.$from.depth)
        return this.mapBlockAt(view, blockPos) ? blockPos : null
    }

    // Writes the whole node to the clipboard, matching MermaidPlugin.handleDiagramCopy.
    handleMapCopy(view, event) {
        const blockPos = this.selectedMapBlockPos(view)
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

    handleMapCut(view, event) {
        const blockPos = this.selectedMapBlockPos(view)
        if (blockPos === null) return false
        this.handleMapCopy(view, event)
        const node = view.state.doc.nodeAt(blockPos)
        if (node) view.dispatch(view.state.tr.delete(blockPos, blockPos + node.nodeSize).scrollIntoView().setMeta('uiEvent', 'cut'))
        return false
    }

    // Registered via handleDOMEvents.paste, not the handlePaste prop -- same
    // reasoning as MermaidPlugin.handleDiagramPaste.
    handleMapPaste(view, event) {
        const blockPos = this.selectedMapBlockPos(view)
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
                handleKeyDown: (view, event) => this.handleMapArrowKey(view, event) || this.handleMapDeleteKey(view, event),
                handleDOMEvents: {
                    copy: (view, event) => this.handleMapCopy(view, event),
                    cut: (view, event) => this.handleMapCut(view, event),
                    paste: (view, event) => this.handleMapPaste(view, event)
                }
            },
            view: (editorView) => {
                // WebKit can't place a caret inside zero-size (font-size: 0) text, so
                // it falls back to painting one at the nearest non-collapsed content
                // instead -- scoping caret-color to the editor root (not the hidden
                // text itself) is the actual fix, matching MermaidPlugin/HTMLFrontMatterPlugin.
                const syncCaretClass = (v) => {
                    const sel = v.state.selection
                    let hideCaret = false
                    if (sel instanceof TextSelection && sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
                        hideCaret = !!this.mapBlockAt(v, sel.$from.before(sel.$from.depth))
                    }
                    v.dom.classList.toggle(HIDE_CARET_CLASS, hideCaret)
                }
                syncCaretClass(editorView)
                return { update: syncCaretClass }
            }
        })
    }

    // A non-geojson instance can still see a language change TO geojson later
    // (the Language dialog mutates node.attrs.language in place) -- mirrors
    // MermaidPlugin.wrapForMermaidUpgrade.
    wrapForGeoJSONUpgrade(instance) {
        const delegateUpdate = instance.update.bind(instance)
        instance.update = (node) => isGeojsonLanguage(node.attrs.language) ? false : delegateUpdate(node)
        return instance
    }

    // Delegates to whatever's already installed for code_block, not assumed
    // to be CodeView specifically -- composable with any other independently-
    // loaded code_block NodeView plugin (Mermaid, HTMLFrontMatter, or a future
    // one), the same capture-wrap-delegate contract they all follow.
    makeCodeBlockFactory(originalFactory, languageDialog, geojsonViewOptions = {}) {
        return (node, view, getPos) => {
            if (isGeojsonLanguage(node.attrs.language)) {
                return new GeoJSONView(node, view, getPos, languageDialog, geojsonViewOptions)
            }
            return this.wrapForGeoJSONUpgrade(originalFactory(node, view, getPos))
        }
    }

    // On macOS, Cmd+V never reaches the DOM as a paste event at all -- see
    // MermaidPlugin.wrapPasteCodeForDiagram for the full explanation. Wrapping
    // MU.pasteCode itself catches this regardless of which path invoked it.
    wrapPasteCodeForMap(view) {
        const originalPasteCode = MU.pasteCode
        MU.pasteCode = (text) => {
            const blockPos = this.selectedMapBlockPos(view)
            if (blockPos === null) return originalPasteCode(text)
            const node = view.state.doc.nodeAt(blockPos)
            const from = blockPos + 1
            const to = blockPos + node.nodeSize - 1
            const tr = text ? view.state.tr.replaceWith(from, to, view.state.schema.text(text)) : view.state.tr.delete(from, to)
            view.dispatch(tr.scrollIntoView())
        }
    }

    // Wires this plugin into the currently active editor view: adopts the
    // geojson stylesheet, installs the code_block NodeView factory override,
    // wraps MU.pasteCode, registers with markupeditor-base's plugin registry,
    // and adds the keyboard/clipboard Plugin to the editor state.
    install() {
        const view = MU.activeView()
        if (!view) return

        this.adoptGeoJSONStyles(view)

        const codeBlockFactory = this.makeCodeBlockFactory(view.props.nodeViews.code_block, MU.languageDialog)
        view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: codeBlockFactory } })
        this.wrapPasteCodeForMap(view)

        // We need to register the codeview plugin so that isRecognizedLanguage returns
        // true when used in the LanguageDialogItem of markupeditor-base
        MU.registerPlugin({ name: 'GeoJSON', type: 'codeview' })

        const plugin = this.createPlugin()
        view.updateState(view.state.reconfigure({ plugins: [plugin, ...view.state.plugins] }))
    }
}

export const geojsonPlugin = new GeoJSONPlugin()

geojsonPlugin.install()
