import { MU, Selection } from 'markupeditor'
import mermaid from 'mermaid'

const TAB_CLASS = 'mermaid-mode-toggle'
const TAB_ACTIVE_CLASS = 'mermaid-mode-toggle-active'
const TAB_BELOW_CLASS = 'mermaid-mode-toggle-below'
const DIAGRAM_SELECTED_CLASS = 'mermaid-diagram-selected'
const HIDDEN_CODE_CLASS = 'mermaid-hidden-code'
const DIAGRAM_CLASS = 'mermaid-diagram'
const PLACEHOLDER_CLASS = 'mermaid-placeholder'

export function isMermaidLanguage(language) {
    return (language ?? '').trim().toLowerCase() === 'mermaid'
}

let idCounter = 0

// Instances add themselves in the constructor, remove themselves in
// destroy() — forceRerenderAll needs every live instance regardless of
// selection state, since codeLanguageTabPlugin's setActive only fires for
// the currently selected one.
const liveInstances = new Set()

/**
 * NodeView for a code_block whose language is mermaid. Extends MU.CodeView:
 * inherits dom (<pre>), contentDOM (<code>), the Language tab, and the
 * this.dom.codeView = this backreference codeLanguageTabPlugin uses to find
 * and activate the current NodeView (it looks up view.nodeDOM(pos)?.codeView
 * generically, so it drives this class's setActive too, unmodified).
 *
 * Adds two more tabs (Source, Diagram) and a diagram-render box, all DOM
 * siblings of contentDOM inside dom. Mode ('source' | 'diagram') is plain
 * instance state: switching it is a synchronous DOM/property mutation, not
 * a dispatched transaction.
 */
export class MermaidView extends MU.CodeView {
    constructor(node, view, getPos, languageDialog, { render = mermaid.render.bind(mermaid), reportError = MU.reportError } = {}) {
        super(node, view, getPos, languageDialog)
        this.getPos = getPos
        this.render = render
        this.reportError = reportError
        this.node = node
        
        this.mode = 'source'
        this.isActive = false
        this.cached = null // null | {pending:true} | {svg} | {error}
        this.lastRenderedText = null
        this.renderToken = 0
        
        this.diagramContainer = document.createElement('div')
        this.diagramContainer.contentEditable = 'false'
        // Clicking the diagram/placeholder box moves the ProseMirror selection
        // into the block's (invisible-while-collapsed, but still real)
        // content — the same way clicking a selected image selects it. getPos()
        // is resolved at click time, not baked in at construction, so this
        // stays correct after an unrelated edit shifts the block.
        this.diagramContainer.addEventListener('mousedown', (e) => {
            e.preventDefault()
            const pos = this.getPos()
            if (pos === undefined) return
                this.view.dispatch(this.view.state.tr.setSelection(Selection.near(this.view.state.doc.resolve(pos + 1))))
                })
        
        this.sourceTab = this.buildModeTab('Source', 'source', () => this.setMode(true))
        this.diagramTab = this.buildModeTab('Diagram', 'diagram', () => this.setMode(false))
        
        liveInstances.add(this)
        // Defaults to attempting Diagram; setMode's empty-content guard
        // (in ensureRendered) falls back to Source for a block with no
        // content yet.
        this.setMode(false)
    }
    
    update(node) {
        const handled = super.update(node) // syncs language class + Language tab label
        if (!handled) return false
            // The Language dialog can change node.attrs.language on this SAME node
            // identity without ProseMirror rebuilding the NodeView on its own —
            // returning false here is what tells it to discard this instance and
            // ask the factory again, which (language no longer mermaid) builds a
            // plain CodeView instead. Without this, a block that stops being
            // mermaid keeps its Source/Diagram tabs and diagram box forever.
            if (!isMermaidLanguage(node.attrs.language)) return false
                this.node = node
                const text = node.textContent
                if (text !== this.lastRenderedText) {
                    // Content actually changed since the cache was last populated —
                    // invalidate. If Diagram is currently showing, re-render immediately;
                    // if Source is showing, leave it be (editing while Source is showing
                    // must never re-trigger a render/error-report on every keystroke) and
                    // let a later, explicit switch to Diagram pick up the fresh text then.
                    this.cached = null
                    // Content can be replaced wholesale by something other than
                    // setMode/tab-click (wrapPasteCodeForDiagram's whole-block replace
                    // on a native macOS paste, for one) — that never goes through
                    // syncModeClasses at all, so the hidden-text class would otherwise
                    // be left however it was BEFORE this change, not derived from the
                    // CURRENT mode. Safe to set directly (no domObserver bracketing
                    // needed) since update() only ever runs inside ProseMirror's
                    // dispatch, already inside a stopped-observer window — same
                    // reasoning as MU.CodeView's syncLanguageClass/setTabLabel calls.
                    this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, this.mode === 'diagram')
                    if (this.mode === 'diagram') this.ensureRendered()
                        }
        return true
    }
    
    setActive(isActive) {
        super.setActive(isActive) // Language tab, via MU.CodeView
        this.isActive = isActive
        if (isActive) {
            const shouldBeBelow = !this.hasRoomAbove()
            if (!this.dom.contains(this.sourceTab)) this.dom.appendChild(this.sourceTab)
                if (!this.dom.contains(this.diagramTab)) this.dom.appendChild(this.diagramTab)
                    this.sourceTab.classList.toggle(TAB_BELOW_CLASS, shouldBeBelow)
                    this.diagramTab.classList.toggle(TAB_BELOW_CLASS, shouldBeBelow)
                    this.positionTabs()
                    } else {
                        if (this.dom.contains(this.sourceTab)) this.dom.removeChild(this.sourceTab)
                            if (this.dom.contains(this.diagramTab)) this.dom.removeChild(this.diagramTab)
                                }
        this.syncSelectedClass()
    }
    
    // codeLanguageTabPlugin (markupeditor-base) only calls setActive when
    // the SELECTED instance itself changes — it skips the call entirely while
    // selection stays inside the same block (via its activeCodeView === next
    // check). That leaves this.mode free to change afterward (e.g. pasting
    // real content into a still-selected, previously-empty block, which
    // switches Source -> Diagram once real text exists) with no setActive
    // call to react to it — setMode must also re-sync the border, not just
    // setActive.
    syncSelectedClass() {
        this.diagramContainer.classList.toggle(DIAGRAM_SELECTED_CLASS, this.isActive && this.mode === 'diagram')
    }
    
    destroy() {
        liveInstances.delete(this)
        super.destroy()
    }
    
    // An OS dark/light change invalidates every cached SVG's baked-in colors
    // regardless of whether this instance is currently selected — called via
    // forceRerenderAll from the plugin's theme-change listener, not driven
    // by setActive/update at all.
    rerender() {
        this.cached = null
        this.lastRenderedText = null
        if (this.mode === 'diagram') this.ensureRendered()
            }
    
    static forceRerenderAll() {
        for (const instance of liveInstances) instance.rerender()
            }
    
    // ---- internals ----
    
    buildModeTab(label, tabType, onClick) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = TAB_CLASS
        button.dataset.tab = tabType
        // Without this, the button is ambiguous to the browser's native cursor
        // placement as part of the code_block's editable text flow — matches
        // MU.CodeView's Language tab.
        button.contentEditable = 'false'
        button.textContent = label
        button.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation() // don't also trigger diagramContainer's select-on-click handler
            onClick()
        })
        return button
    }
    
    // Explicit SET, not a toggle: clicking the already-active tab is a
    // harmless no-op rather than flipping away from it — both tabs render
    // while selected, so idempotence matters here.
    setMode(isSource) {
        const nextMode = isSource ? 'source' : 'diagram'
        if (nextMode === this.mode) return
            this.mode = nextMode
            this.syncModeClasses()
            if (this.mode === 'diagram') this.ensureRendered()
                }
    
    // domObserver.stop()/start() bracketing this whole method: it's called
    // from a tab click and from async render completion, both outside any
    // ProseMirror-initiated dispatch/update cycle — unlike MU.CodeView's
    // contentDOM.className write (syncLanguageClass), which only ever runs
    // from inside update(). Toggling a class directly on contentDOM (not a
    // descendant of it) fails
    // MU.CodeView's inherited ignoreMutation guard for this specific target —
    // `Node.contains()` returns true for a node containing itself, so
    // `!this.contentDOM.contains(mutation.target)` is false for a mutation
    // whose target IS contentDOM, meaning the mutation is NOT ignored. Left
    // unbracketed, ProseMirror treats this as an external change and
    // destroys/reconstructs the NodeView on every mode switch, which
    // re-triggers the same mutation on the fresh instance — an infinite loop.
    syncModeClasses() {
        // Optional chaining: view.domObserver doesn't exist yet the very first
        // time this runs (from the constructor, attempting Diagram by default,
        // during the view's OWN initial docView construction — domObserver is
        // only set up once that finishes) — nothing is watching for mutations
        // yet at that point anyway, so there's nothing to bracket.
        this.view.domObserver?.stop()
        try {
            const isSource = this.mode === 'source'
            this.sourceTab.classList.toggle(TAB_ACTIVE_CLASS, isSource)
            this.diagramTab.classList.toggle(TAB_ACTIVE_CLASS, !isSource)
            // Only contentDOM collapses — dom (the <pre>) stays a normal,
            // visible box so its tabs have something to anchor to, and
            // diagramContainer (a real DOM sibling) can display inside it.
            this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, !isSource)
            // .contains(), NOT .isConnected: this runs from the constructor (via
            // setMode, attempting Diagram by default) before ProseMirror has
            // attached this.dom to the live document — .isConnected reads false
            // for a genuine child of a not-yet-attached dom, which would desync
            // this bookkeeping from actual DOM membership.
            if (isSource && this.dom.contains(this.diagramContainer)) this.dom.removeChild(this.diagramContainer)
                if (!isSource && !this.dom.contains(this.diagramContainer)) this.dom.appendChild(this.diagramContainer)
                    } finally {
                        this.view.domObserver?.start()
                    }
        this.syncSelectedClass()
    }
    
    // Deferred to a frame, matching MU.CodeView's Language-tab positioning —
    // both tabs' offsetWidth (Source is always static width, Diagram too)
    // aren't meaningful until painted. Re-run every time this becomes the
    // active block (not just once), guarding against a window resize or
    // toolbar visibility change between activations rather than assuming the
    // first measurement stays valid forever.
    positionTabs() {
        requestAnimationFrame(() => {
            if (!this.dom.isConnected) return // torn down before the frame fired — this check IS meant to be real document connectivity
                const gap = 4
                let right = gap
                if (this.tab && this.dom.contains(this.tab)) right = this.tab.offsetWidth + gap
                    if (this.dom.contains(this.diagramTab)) {
                        this.diagramTab.style.right = `${right}px`
                        right += this.diagramTab.offsetWidth + gap
                    }
            if (this.dom.contains(this.sourceTab)) this.sourceTab.style.right = `${right}px`
                })
    }
    
    ensureRendered() {
        const text = this.node.textContent
        if (text.trim() === '') {
            // Nothing to render — fall back to Source. setMode is a no-op if
            // already there (can't happen on the very first call, since this is
            // only reached via setMode(false) having just set mode='diagram').
            this.setMode(true)
            return
        }
        if (this.cached && this.lastRenderedText === text) {
            if (this.cached.error) {
                // Re-entering Diagram (e.g. clicking the tab again) with the same
                // still-failing text — bounce back to Source immediately rather
                // than getting stuck showing paintDiagram's "pending" placeholder
                // forever (it only distinguishes svg vs not-yet-rendered, not svg
                // vs failed). Does not re-report: the error was already reported
                // once, when this cache entry was first populated.
                this.setMode(true)
                return
            }
            this.paintDiagram()
            return
        }
        this.lastRenderedText = text
        this.cached = { pending: true }
        this.paintDiagram()
        
        const token = ++this.renderToken
        const id = `mermaid-diagram-${idCounter++}`
        let renderPromise
        try {
            renderPromise = this.render(id, text)
        } catch (error) {
            this.handleRenderOutcome(token, text, { error })
            return
        }
        renderPromise
        .then((result) => this.handleRenderOutcome(token, text, { svg: result.svg }))
        .catch((error) => this.handleRenderOutcome(token, text, { error }))
    }
    
    handleRenderOutcome(token, text, outcome) {
        // Superseded by a later edit or a later rerender() before this one
        // resolved — its result is stale, drop it rather than overwrite
        // whatever the newer attempt already produced or is still producing.
        if (token !== this.renderToken) return
            if (outcome.error) {
                const message = outcome.error?.message ?? String(outcome.error)
                this.cached = { error: message }
                // Reported exactly once per distinct failure — this.lastRenderedText
                // is already set to this failing text above, so a later call that
                // sees the same text and cached error short-circuits via the
                // `this.cached && this.lastRenderedText === text` check and never
                // re-reports it (mode is about to flip to Source below anyway, which
                // stops render attempts for this text entirely until it changes).
                this.reportError('MermaidRenderError', message, text, true)
                this.setMode(true)
                return
            }
        this.cached = { svg: outcome.svg }
        if (this.mode === 'diagram') this.paintDiagram()
            }
    
    // classList add/remove, NOT className = '...': a full replacement would
    // wipe DIAGRAM_SELECTED_CLASS whenever this runs after syncSelectedClass
    // already set it.
    paintDiagram() {
        this.diagramContainer.classList.remove(DIAGRAM_CLASS, PLACEHOLDER_CLASS)
        if (this.cached?.svg) {
            this.diagramContainer.classList.add(DIAGRAM_CLASS)
            this.diagramContainer.innerHTML = this.cached.svg
        } else {
            this.diagramContainer.classList.add(PLACEHOLDER_CLASS)
            this.diagramContainer.textContent = 'Rendering…'
        }
    }
}
