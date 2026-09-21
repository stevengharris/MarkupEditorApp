import { MU, NodeSelection } from 'markupeditor'
import { metadataPluginKey } from './metadatapluginkey.js'
import { metadataScalar, parseFrontmatterEntries } from 'markupeditor-plugin-kit/metadata'

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

// Instances register themselves in the constructor, deregister in
// destroy(). ProseMirror does not call a NodeView's update() for a pure
// position shift, so position and collapse-state sync run from the
// Plugin's view-update hook instead, which fires on every transaction.
const liveInstances = new Set()

/**
 * NodeView for a code_block with language "metadata" at document position 0
 * -- the shape a document's YAML frontmatter round-trips through while
 * being edited. Extends MU.CodeView: dom (<pre>) and contentDOM (<code>)
 * remain the Source editing surface; the inherited Language tab is
 * suppressed (see setActive).
 *
 * Adds a collapse/expand bar and, when expanded, a Table/Source toggle.
 * Table is a read-only rendering of the same content Source holds; Source
 * is contentDOM itself, shown/hidden via HIDDEN_CODE_CLASS.
 *
 * Position enforcement mirrors HTMLFrontMatterView: once checkAllPositions()
 * observes getPos() !== 0, the instance permanently falls back to plain
 * code-block rendering via forcePlainOnly(). Unlike HTMLFrontMatterView, there
 * is no language-away check in update() -- MetadataPlugin's
 * appendTransaction guard already prevents node.attrs.language from ever
 * differing from "metadata" at position 0.
 */
export class MetadataView extends MU.CodeView {
    constructor(node, view, getPos, languageDialog) {
        super(node, view, getPos, languageDialog)
        this.getPos = getPos
        this.node = node
        this.mode = null // setMode(true) below sets the real value; starting at 'table' would make its no-op guard skip initial DOM class application
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

        // Clicking Table/Source while collapsed also expands, rather than being a no-op.
        this.tableTab = this.buildModeTab('Table', 'table', () => { this.ensureExpanded(); this.setMode(true) })
        this.sourceTab = this.buildModeTab('Source', 'source', () => { this.ensureExpanded(); this.setMode(false) })
        this.bar.appendChild(this.tableTab)
        this.bar.appendChild(this.sourceTab)

        this.content = document.createElement('div')
        this.content.className = CONTENT_CLASS

        this.tableContainer = document.createElement('div')
        this.tableContainer.className = TABLE_CLASS
        this.tableContainer.contentEditable = 'false'

        // contentDOM starts as a child of dom (base CodeView constructor);
        // appendChild here moves it into content, as a sibling of
        // tableContainer, so Table and Source share the same padding.
        this.dom.appendChild(this.bar)
        this.dom.appendChild(this.content)
        this.content.appendChild(this.tableContainer)
        this.content.appendChild(this.contentDOM)

        this.setMode(true) // Table default
        this.syncCollapsedFromPluginState()
        this.renderTable()
    }

    update(node) {
        // super.update() -> syncLanguageClass() overwrites contentDOM.className
        // entirely, wiping HIDDEN_CODE_CLASS on every keystroke. Re-apply
        // after calling super, not just at construction/setMode time.
        const handled = super.update(node)
        if (!handled) return false
        this.node = node
        this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, this.mode === 'table')
        if (this.mode === 'table') this.renderTable()
        return true
    }

    // The language-change guard lives in MetadataPlugin's appendTransaction
    // hook, so this view never needs to check node.attrs.language itself.
    setActive(isActive) {
        // Does not call super.setActive -- suppresses the inherited
        // Language tab. The selected outline is driven separately by
        // syncSelectedFromState, since codeLanguageTabPlugin's setActive is
        // TextSelection-only per CodeView's doc comment, never the
        // NodeSelection a Table-mode block gets.
        this.isActive = isActive
    }

    // Toggles the whole-block selected outline from live selection state,
    // called from the Plugin's view-update hook on every transaction.
    // Applied to dom (the whole block), matching Mermaid's/HTMLFrontMatterView's
    // selected outline.
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

    // Called from the Plugin's view-update hook on every transaction, since
    // a pure position shift never reaches update() (see class doc comment).
    static checkAllPositions() {
        for (const instance of liveInstances) {
            if (instance.getPos() !== 0) instance.forcePlainOnly()
        }
    }

    static syncAllCollapsedState() {
        for (const instance of liveInstances) instance.syncCollapsedFromPluginState()
    }

    // Idempotent, one-way: once no longer at position 0, this instance
    // never shows the bar/Table/Source chrome again. Undo back to position
    // 0 constructs a fresh instance via the factory.
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

    // Expands if collapsed; no-op if already expanded. Lets Table/Source tab
    // clicks reveal a collapsed block without re-collapsing an expanded one.
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

    // Explicit SET, not a toggle -- matches HTMLFrontMatterView's setMode.
    setMode(isTable) {
        const nextMode = isTable ? 'table' : 'source'
        if (nextMode === this.mode) return
        this.mode = nextMode
        this.syncModeClasses()
        // A tab click dispatches no transaction, so the view-update hook
        // won't fire from this alone -- resync the outline against the
        // current selection.
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
        const rows = parseFrontmatterEntries(this.node.textContent)
        this.tableContainer.replaceChildren()
        this.tableContainer.classList.toggle(TABLE_EMPTY_CLASS, rows.length === 0)
        if (rows.length === 0) {
            const empty = document.createElement('div')
            empty.textContent = 'No metadata'
            this.tableContainer.appendChild(empty)
            return
        }
        // Cells are direct children of tableContainer (a CSS grid, not
        // per-row flexboxes) so the key column's width is computed once
        // across every row.
        rows.forEach(({ key, value }, index) => {
            const striped = index % 2 === 1
            const keyEl = document.createElement('span')
            keyEl.className = 'metadata-table-key' + (striped ? ' metadata-table-striped' : '')
            keyEl.textContent = key
            const valueEl = document.createElement('span')
            valueEl.className = 'metadata-table-value' + (striped ? ' metadata-table-striped' : '')
            valueEl.textContent = metadataScalar(value)
            if (index > 0) {
                keyEl.classList.add('metadata-table-row-border')
                valueEl.classList.add('metadata-table-row-border')
            }
            this.tableContainer.appendChild(keyEl)
            this.tableContainer.appendChild(valueEl)
        })
    }
}
