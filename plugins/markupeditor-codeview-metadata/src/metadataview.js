import { MU, NodeSelection } from 'markupeditor'
import { metadataPluginKey } from './metadatapluginkey.js'

const BAR_CLASS = 'metadata-bar'
const DISCLOSURE_CLASS = 'metadata-disclosure'
const DISCLOSURE_COLLAPSED_CLASS = 'metadata-disclosure-collapsed'
const LABEL_CLASS = 'metadata-label'
const CONTENT_CLASS = 'metadata-content'
const CONTENT_COLLAPSED_CLASS = 'metadata-content-collapsed'
const TAB_CLASS = 'metadata-mode-toggle'
const TAB_ACTIVE_CLASS = 'metadata-mode-toggle-active'
const HIDDEN_CODE_CLASS = 'metadata-hidden-code'
const TABLE_CLASS = 'metadata-table'
const TABLE_EMPTY_CLASS = 'metadata-table-empty'
const SELECTED_CLASS = 'metadata-selected'

export function isMetadataLanguage(language) {
    return (language ?? '').trim().toLowerCase() === 'metadata'
}

/**
 * Best-effort, glanceable parse of the raw metadata text into key/value
 * rows for Table display. Deliberately not a real YAML parser -- the
 * authoritative parse (with warnings for anything unsupported) is
 * `YAMLMetadata.parse` on the Swift side, at the sync boundary. This only
 * needs to handle the same simple `key: value` shape that parser documents
 * as in-scope; anything else (multi-line scalars, nested mappings, list
 * items) is silently skipped here rather than misrendered, since Table is
 * a preview, not a save path.
 */
export function parseMetadataRows(text) {
    const rows = []
    for (const rawLine of (text ?? '').split('\n')) {
        const line = rawLine.trim()
        if (!line || line.startsWith('#') || line === '---') continue
        const match = line.match(/^([^:\s][^:]*):\s?(.*)$/)
        if (!match) continue
        rows.push({ key: match[1].trim(), value: match[2].trim() })
    }
    return rows
}

// Instances add themselves in the constructor, remove themselves in
// destroy(). Needed for the same reason as FrontMatterView's liveInstances:
// ProseMirror does NOT call a NodeView's own update() for a PURE position
// shift, so position enforcement and collapse-state sync both have to be
// driven from MetadataPlugin's Plugin view-update hook (which DOES fire on
// every transaction) rather than update() alone.
const liveInstances = new Set()

/**
 * NodeView for a code_block whose language is "metadata" AND which sits at
 * document position 0 -- the always-recognized shape a document's YAML
 * frontmatter round-trips through while being edited. Extends
 * MU.CodeView: inherits dom (<pre>), contentDOM (<code>) as the Source
 * editing surface, and the this.dom.codeView = this backreference
 * codeLanguageTabPlugin uses -- though this view suppresses the inherited
 * Language tab entirely (setActive override below).
 *
 * Adds a persistent collapse/expand bar (chrome, sibling of contentDOM) and,
 * when expanded, a Table/Source toggle -- Table (the default) is a
 * view-only rendering of the same content Source holds; Source is
 * contentDOM itself, shown/hidden via the same HIDDEN_CODE_CLASS pattern
 * FrontMatterView uses for its Rendered mode.
 *
 * Position enforcement mirrors FrontMatterView: once checkAllPositions()
 * (driven by MetadataPlugin) observes getPos() !== 0, this instance
 * permanently falls back to plain-CodeView-like display via
 * forcePlainOnly() -- no bar, no Table/Source toggle; it just renders as an
 * ordinary code block from then on. Unlike
 * FrontMatterView, there is no separate language-away defense-in-depth
 * check in update(): MetadataPlugin's appendTransaction guard (not a
 * passive, reversible reasoning) already prevents node.attrs.language from
 * ever being observably different from "metadata" while at position 0, so
 * by the time update() runs the language has already been corrected within
 * the same transaction batch.
 */
export class MetadataView extends MU.CodeView {
    constructor(node, view, getPos, languageDialog) {
        super(node, view, getPos, languageDialog)
        this.getPos = getPos
        this.node = node
        this.mode = null // set for real by setMode(true) below -- must NOT start equal to 'table', or that call's no-op guard would skip applying the initial DOM classes entirely
        this.isActive = false
        this.positionValid = true // factory only ever constructs this when getPos() === 0 already holds

        liveInstances.add(this)

        this.bar = document.createElement('div')
        this.bar.className = BAR_CLASS
        this.bar.contentEditable = 'false'

        this.disclosure = document.createElement('span')
        this.disclosure.className = DISCLOSURE_CLASS

        this.label = document.createElement('span')
        this.label.className = LABEL_CLASS
        this.label.textContent = 'Metadata'

        this.bar.appendChild(this.disclosure)
        this.bar.appendChild(this.label)
        this.bar.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation() // don't also let ProseMirror reposition the selection from this click
            this.toggleCollapsed()
        })

        // Clicking Table/Source while collapsed also expands -- the click is a clear signal
        // the user wants to see that content now, not a no-op hidden behind the collapse bar.
        this.tableTab = this.buildModeTab('Table', 'table', () => { this.ensureExpanded(); this.setMode(true) })
        this.sourceTab = this.buildModeTab('Source', 'source', () => { this.ensureExpanded(); this.setMode(false) })
        this.bar.appendChild(this.tableTab)
        this.bar.appendChild(this.sourceTab)

        this.content = document.createElement('div')
        this.content.className = CONTENT_CLASS

        this.tableContainer = document.createElement('div')
        this.tableContainer.className = TABLE_CLASS
        this.tableContainer.contentEditable = 'false'

        // contentDOM starts as a direct child of dom (the base CodeView
        // constructor put it there); appendChild here MOVES it into content,
        // as a sibling of tableContainer, so Table and Source share the same
        // padded wrapper -- keeps spacing identical between the two modes
        // instead of contentDOM sitting outside content's padding box.
        this.dom.appendChild(this.bar)
        this.dom.appendChild(this.content)
        this.content.appendChild(this.tableContainer)
        this.content.appendChild(this.contentDOM)

        this.setMode(true) // Table default
        this.syncCollapsedFromPluginState()
        this.renderTable()
    }

    update(node) {
        // Regression: super.update() -> syncLanguageClass() does
        // `this.contentDOM.className = ...`, a full overwrite rather than an
        // additive change -- it silently wipes out HIDDEN_CODE_CLASS on
        // every content update (i.e. every keystroke while positioned
        // inside contentDOM), unhiding the raw Source text while
        // tableContainer is still also showing. Re-apply after, not just at
        // construction/setMode time.
        const handled = super.update(node)
        if (!handled) return false
        this.node = node
        this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, this.mode === 'table')
        if (this.mode === 'table') this.renderTable()
        return true
    }

    // The active language-change guard lives in MetadataPlugin's
    // appendTransaction hook -- this view never needs to inspect
    // node.attrs.language for "did it change away" the way FrontMatterView
    // does, since the guard already prevented that from ever landing in a
    // committed state.
    setActive(isActive) {
        // Deliberately does NOT call super.setActive -- suppresses the
        // inherited Language tab entirely (kept even though
        // the appendTransaction guard is the actual protection, so a user
        // never even sees the option on this block's own chrome). isActive
        // itself no longer drives the selected outline -- see
        // syncSelectedFromState: codeLanguageTabPlugin's setActive callback
        // is TextSelection-inside-only per CodeView's own doc comment,
        // never a NodeSelection, which is exactly the selection kind
        // landing on a Table-mode block now creates (MetadataPlugin's
        // handleMetadataArrowKey).
        this.isActive = isActive
    }

    // Toggles the whole-block selected outline directly from live selection
    // state (called from MetadataPlugin's Plugin view-update hook on every
    // transaction), not from setActive. Applied to `dom` (the whole <pre> --
    // bar, content, contentDOM together), not just tableContainer, so the
    // outline reads as "this whole block is selected," matching Mermaid's/
    // FrontMatterView's own selected-diagram/-block outline.
    syncSelectedFromState(state) {
        if (!this.positionValid) return
        const sel = state.selection
        const selected = sel instanceof NodeSelection && sel.from === this.getPos()
        this.dom.classList.toggle(SELECTED_CLASS, selected && this.mode === 'table')
    }

    static syncAllSelectedState(state) {
        for (const instance of liveInstances) instance.syncSelectedFromState(state)
    }

    destroy() {
        liveInstances.delete(this)
        super.destroy()
    }

    // The actual position-0 enforcement mechanism -- called from
    // MetadataPlugin's Plugin view-update hook on every transaction, since
    // a pure position shift never reaches update() at all (see class doc
    // comment).
    static checkAllPositions() {
        for (const instance of liveInstances) {
            if (instance.getPos() !== 0) instance.forcePlainOnly()
        }
    }

    static syncAllCollapsedState() {
        for (const instance of liveInstances) instance.syncCollapsedFromPluginState()
    }

    // Idempotent, one-way: once a block is no longer at position 0, it
    // never shows the bar/Table/Source chrome again for the lifetime of
    // this instance (undo back to position 0 constructs a fresh instance
    // via the factory, which re-evaluates the position check from scratch)
    // -- it just renders as an ordinary code block from then on.
    forcePlainOnly() {
        if (!this.positionValid) return
        this.positionValid = false
        this.dom.appendChild(this.contentDOM) // re-parent back under dom directly -- it currently lives inside content, which is about to be removed
        if (this.dom.contains(this.bar)) this.dom.removeChild(this.bar)
        if (this.dom.contains(this.content)) this.dom.removeChild(this.content)
        this.contentDOM.classList.remove(HIDDEN_CODE_CLASS)
    }

    toggleCollapsed() {
        if (!this.positionValid) return
        const current = metadataPluginKey.getState(this.view.state)?.collapsed ?? false
        this.view.dispatch(this.view.state.tr.setMeta(metadataPluginKey, { collapsed: !current }))
    }

    // One-directional: expands if currently collapsed, does nothing if already expanded.
    // Used by the Table/Source tabs so clicking one while collapsed reveals it, without
    // accidentally re-collapsing an already-expanded block.
    ensureExpanded() {
        if (!this.positionValid) return
        const current = metadataPluginKey.getState(this.view.state)?.collapsed ?? false
        if (current) this.view.dispatch(this.view.state.tr.setMeta(metadataPluginKey, { collapsed: false }))
    }

    syncCollapsedFromPluginState() {
        if (!this.positionValid) return
        const collapsed = metadataPluginKey.getState(this.view.state)?.collapsed ?? false
        this.disclosure.classList.toggle(DISCLOSURE_COLLAPSED_CLASS, collapsed)
        this.content.classList.toggle(CONTENT_COLLAPSED_CLASS, collapsed)
    }

    buildModeTab(label, tabType, onClick) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = TAB_CLASS
        button.dataset.tab = tabType
        button.contentEditable = 'false'
        button.textContent = label
        button.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation() // don't also let ProseMirror reposition the selection from this click
            onClick()
        })
        return button
    }

    // Explicit SET, not a toggle -- matches FrontMatterView's setMode.
    setMode(isTable) {
        const nextMode = isTable ? 'table' : 'source'
        if (nextMode === this.mode) return
        this.mode = nextMode
        this.syncModeClasses()
        // A Table/Source tab click dispatches no transaction of its own, so the Plugin's
        // view-update hook won't fire from this alone -- resync the outline immediately
        // against the CURRENT (unchanged) selection, now that mode has moved.
        this.syncSelectedFromState(this.view.state)
        if (this.mode === 'table') this.renderTable()
    }

    syncModeClasses() {
        this.view.domObserver?.stop()
        try {
            const isTable = this.mode === 'table'
            this.tableTab.classList.toggle(TAB_ACTIVE_CLASS, isTable)
            this.sourceTab.classList.toggle(TAB_ACTIVE_CLASS, !isTable)
            this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, isTable)
            this.tableContainer.style.display = isTable ? '' : 'none'
        } finally {
            this.view.domObserver?.start()
        }
    }

    renderTable() {
        const rows = parseMetadataRows(this.node.textContent)
        this.tableContainer.replaceChildren()
        this.tableContainer.classList.toggle(TABLE_EMPTY_CLASS, rows.length === 0)
        if (rows.length === 0) {
            const empty = document.createElement('div')
            empty.textContent = 'No metadata'
            this.tableContainer.appendChild(empty)
            return
        }
        // Cells are direct children of tableContainer (a CSS grid, not
        // per-row flexboxes) so the key column's width is computed ONCE
        // across every row's content -- a real <table>'s column-sizing
        // behavior, which independent per-row flex rows can't reproduce
        // (each would size its own key cell to only its own text).
        rows.forEach(({ key, value }, index) => {
            const striped = index % 2 === 1
            const keyEl = document.createElement('span')
            keyEl.className = 'metadata-table-key' + (striped ? ' metadata-table-striped' : '')
            keyEl.textContent = key
            const valueEl = document.createElement('span')
            valueEl.className = 'metadata-table-value' + (striped ? ' metadata-table-striped' : '')
            valueEl.textContent = value
            if (index > 0) {
                keyEl.classList.add('metadata-table-row-border')
                valueEl.classList.add('metadata-table-row-border')
            }
            this.tableContainer.appendChild(keyEl)
            this.tableContainer.appendChild(valueEl)
        })
    }
}
