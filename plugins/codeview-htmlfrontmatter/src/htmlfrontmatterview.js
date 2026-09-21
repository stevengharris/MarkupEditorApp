import { MU, Selection } from 'markupeditor'
import DOMPurify from 'dompurify'
import { METADATA_LANGUAGE } from 'markupeditor-plugin-kit/metadata'

const TAB_CLASS = 'htmlfrontmatter-mode-toggle'
const TAB_ACTIVE_CLASS = 'htmlfrontmatter-mode-toggle-active'
const TAB_BELOW_CLASS = 'htmlfrontmatter-mode-toggle-below'
const RENDERED_SELECTED_CLASS = 'htmlfrontmatter-rendered-selected'
const HIDDEN_CODE_CLASS = 'htmlfrontmatter-hidden-code'
const RENDERED_CLASS = 'htmlfrontmatter-rendered'
const PLACEHOLDER_CLASS = 'htmlfrontmatter-placeholder'

export function isHTMLFrontMatterLanguage(language) {
    return (language ?? '').trim().toLowerCase() === 'html'
}

// A metadata code_block (a sibling plugin) is also a leading-position
// block and takes position 0 when present, shifting the HTML preamble's
// own valid position to right after it. A plain inline string check
// rather than a package dependency, matching isHTMLFrontMatterLanguage's own
// "html" check.
//
// Returns a ProseMirror position, not a child index: the block after
// metadata is at position `first.nodeSize`, not position 1.
export function expectedPreamblePosition(doc) {
    const first = doc.firstChild
    return (first?.type.name === 'code_block' && first.attrs.language === METADATA_LANGUAGE) ? first.nodeSize : 0
}

// Instances add themselves in the constructor, remove themselves in
// destroy(). Needed because ProseMirror does NOT call a NodeView's own
// update() for a PURE position shift (a preceding sibling inserted, this
// node's own attrs/content unchanged): getPos() correctly returns the new
// position (it's a live closure), the same instance survives (not
// destroyed/recreated), but update() is never invoked. That means
// update()'s own position-0 check below can never fire for exactly the
// case it exists to catch. checkAllPositions(), called from
// HTMLFrontMatterPlugin's Plugin view-update hook (which DOES fire on every
// transaction, unlike a NodeView's own update()), is the actual
// enforcement mechanism; update()'s check is defense in depth for the
// (currently unobserved, but not provably impossible) case where a
// content-changing edit happens to co-occur with a position change.
const liveInstances = new Set()

/**
 * NodeView for a code_block whose language is html AND which sits at the
 * expected leading position -- position 0 normally, or right after it when a
 * metadata code_block (codeview-metadata) occupies position 0
 * (see expectedPreamblePosition) -- the shape markupeditor-app's markdown import
 * rewrites a leading raw-HTML block into (see markdown.js), and the shape
 * MarkupDocument.extractHTMLPreamble unwraps back to raw HTML on export.
 * Extends MU.CodeView: inherits dom (<pre>), contentDOM (<code>), the
 * Language tab, and the this.dom.codeView = this backreference
 * codeLanguageTabPlugin uses to find and activate the current NodeView.
 *
 * Unlike Mermaid (which applies to every mermaid-language block,
 * regardless of position, and renders trusted SVG from an async render
 * call), this view is position-dependent and renders untrusted content
 * synchronously through DOMPurify. Position enforcement is NOT solely
 * update()-based (see liveInstances comment above) -- once
 * checkAllPositions() (or update()) observes getPos() !== expectedPreamblePosition(...), this instance
 * permanently falls back to Source-only display via forceSourceOnly()
 * rather than ProseMirror discarding/reconstructing it as a plain CodeView
 * (there is no public API to force that rebuild from outside the NodeView
 * lifecycle). Functionally equivalent for the one thing that matters --
 * it stops rendering live HTML the moment it's no longer the leading
 * block -- even though the instance's own class identity doesn't change.
 *
 * Adds two tabs (Source, Rendered) and a rendered-HTML box, all DOM
 * siblings of contentDOM inside dom, matching MermaidView's tab pattern.
 * Mode ('source' | 'rendered') is plain instance state.
 */
export class HTMLFrontMatterView extends MU.CodeView {
    constructor(node, view, getPos, languageDialog, { sanitize = DOMPurify.sanitize, purifyConfig = {} } = {}) {
        super(node, view, getPos, languageDialog)
        this.getPos = getPos
        this.sanitize = sanitize
        this.purifyConfig = purifyConfig
        this.node = node

        this.mode = 'source'
        this.isActive = false
        this.lastRenderedText = null
        this.cachedSanitized = null // the SANITIZED OUTPUT, cached alongside the input text -- see paintRendered()
        // Set false, permanently, by forceSourceOnly() -- see class doc
        // comment. The factory only ever constructs this class when
        // getPos() === 0 already holds, so true is the correct initial
        // value here.
        this.positionValid = true

        liveInstances.add(this)

        this.renderedContainer = document.createElement('div')
        this.renderedContainer.contentEditable = 'false'
        // Clicking the rendered box moves the ProseMirror selection into the
        // block's (invisible-while-collapsed, but still real) content --
        // same pattern as MermaidView's diagram click handling.
        this.renderedContainer.addEventListener('mousedown', (e) => {
            e.preventDefault()
            const pos = this.getPos()
            if (pos === undefined) return
            this.view.dispatch(this.view.state.tr.setSelection(Selection.near(this.view.state.doc.resolve(pos + 1))))
        })

        this.sourceTab = this.buildModeTab('Source', 'source', () => this.setMode(true))
        this.renderedTab = this.buildModeTab('Rendered', 'rendered', () => this.setMode(false))

        // Defaults to attempting Rendered; setMode's empty-content guard
        // (in ensureRendered) falls back to Source for a block with no
        // content yet.
        this.setMode(false)
    }

    update(node) {
        const handled = super.update(node) // syncs language class + Language tab label
        if (!handled) return false
        // Language dialog can change node.attrs.language on this SAME node
        // identity without ProseMirror rebuilding the NodeView -- returning
        // false tells it to discard this instance and ask the factory
        // again, which (language no longer html) builds a plain CodeView.
        if (!isHTMLFrontMatterLanguage(node.attrs.language)) return false
        // Defense in depth, not the primary enforcement -- see the class
        // doc comment and liveInstances' comment. A pure position shift
        // (no attrs/content change) never reaches this method at all;
        // checkAllPositions() is what actually catches that case. This
        // check only matters for the (unobserved) case of a
        // content-changing edit that also happens to shift position.
        // expectedPreamblePosition, not a bare 0 -- a metadata block at
        // position 0 shifts the HTML preamble's own valid position.
        if (this.getPos() !== expectedPreamblePosition(this.view.state.doc)) {
            this.forceSourceOnly()
            return true
        }
        this.node = node
        const text = node.textContent
        if (text !== this.lastRenderedText) {
            // Content actually changed since the cache was last populated.
            // If Rendered is currently showing, re-render immediately; if
            // Source is showing, leave it be (editing while Source is
            // showing must never re-render on every keystroke) and let a
            // later, explicit switch to Rendered pick up the fresh text.
            this.lastRenderedText = null
            this.cachedSanitized = null
            this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, this.mode === 'rendered')
            if (this.mode === 'rendered') this.ensureRendered()
        }
        return true
    }

    setActive(isActive) {
        super.setActive(isActive) // Language tab, via MU.CodeView
        this.isActive = isActive
        if (isActive) {
            const shouldBeBelow = !this.hasRoomAbove()
            if (!this.dom.contains(this.sourceTab)) this.dom.appendChild(this.sourceTab)
            // Once forceSourceOnly() has run, the Rendered tab is never
            // re-offered -- there is nothing left to toggle back to.
            if (this.positionValid && !this.dom.contains(this.renderedTab)) this.dom.appendChild(this.renderedTab)
            this.sourceTab.classList.toggle(TAB_BELOW_CLASS, shouldBeBelow)
            this.renderedTab.classList.toggle(TAB_BELOW_CLASS, shouldBeBelow)
            this.positionTabs()
        } else {
            if (this.dom.contains(this.sourceTab)) this.dom.removeChild(this.sourceTab)
            if (this.dom.contains(this.renderedTab)) this.dom.removeChild(this.renderedTab)
        }
        this.syncSelectedClass()
    }

    // codeLanguageTabPlugin (markupeditor-base) only calls setActive when the
    // SELECTED instance itself changes -- matches MermaidView's reasoning
    // for why setMode must also re-sync the border, not just setActive.
    syncSelectedClass() {
        this.renderedContainer.classList.toggle(RENDERED_SELECTED_CLASS, this.isActive && this.mode === 'rendered')
    }

    destroy() {
        liveInstances.delete(this)
        super.destroy()
    }

    // The actual position-0 enforcement mechanism -- see the class doc
    // comment and liveInstances' comment for why this exists instead of
    // relying on update(). Called from HTMLFrontMatterPlugin's Plugin
    // view-update hook on every transaction.
    static checkAllPositions() {
        for (const instance of liveInstances) {
            if (instance.getPos() !== expectedPreamblePosition(instance.view.state.doc)) instance.forceSourceOnly()
        }
    }

    // Idempotent, one-way: once a block is no longer at position 0, it
    // never renders live HTML again for the lifetime of this instance
    // (undo back to position 0 constructs a fresh instance via the
    // factory, which re-evaluates the position check from scratch).
    forceSourceOnly() {
        if (!this.positionValid) return
        this.positionValid = false
        if (this.dom.contains(this.renderedTab)) this.dom.removeChild(this.renderedTab)
        this.setMode(true)
    }

    buildModeTab(label, tabType, onClick) {
        const button = document.createElement('button')
        button.type = 'button'
        button.className = TAB_CLASS
        button.dataset.tab = tabType
        // Without this, the button is ambiguous to the browser's native
        // cursor placement as part of the code_block's editable text flow.
        button.contentEditable = 'false'
        button.textContent = label
        button.addEventListener('mousedown', (e) => {
            e.preventDefault()
            e.stopPropagation() // don't also trigger renderedContainer's select-on-click handler
            onClick()
        })
        return button
    }

    // Explicit SET, not a toggle: clicking the already-active tab is a
    // harmless no-op rather than flipping away from it. Belt-and-suspenders
    // guard against 'rendered' once positionValid is false -- the
    // renderedTab is removed by forceSourceOnly()/setActive() so this
    // shouldn't be reachable via a click, but a queued event or a stray
    // call is a silent no-op rather than a violation of the invariant.
    setMode(isSource) {
        if (!isSource && !this.positionValid) return
        const nextMode = isSource ? 'source' : 'rendered'
        if (nextMode === this.mode) return
        this.mode = nextMode
        this.syncModeClasses()
        if (this.mode === 'rendered') this.ensureRendered()
    }

    // domObserver.stop()/start() bracketing: called from a tab click and
    // from update(), both outside a ProseMirror-initiated dispatch/update
    // cycle in the tab-click case -- same reasoning as MermaidView's
    // syncModeClasses, which this mirrors directly.
    syncModeClasses() {
        this.view.domObserver?.stop()
        try {
            const isSource = this.mode === 'source'
            this.sourceTab.classList.toggle(TAB_ACTIVE_CLASS, isSource)
            this.renderedTab.classList.toggle(TAB_ACTIVE_CLASS, !isSource)
            this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, !isSource)
            if (isSource && this.dom.contains(this.renderedContainer)) this.dom.removeChild(this.renderedContainer)
            if (!isSource && !this.dom.contains(this.renderedContainer)) this.dom.appendChild(this.renderedContainer)
        } finally {
            this.view.domObserver?.start()
        }
        this.syncSelectedClass()
    }

    // Deferred to a frame, matching MU.CodeView's Language-tab positioning.
    positionTabs() {
        requestAnimationFrame(() => {
            if (!this.dom.isConnected) return
            const gap = 4
            let right = gap
            if (this.tab && this.dom.contains(this.tab)) right = this.tab.offsetWidth + gap
            if (this.dom.contains(this.renderedTab)) {
                this.renderedTab.style.right = `${right}px`
                right += this.renderedTab.offsetWidth + gap
            }
            if (this.dom.contains(this.sourceTab)) this.sourceTab.style.right = `${right}px`
        })
    }

    ensureRendered() {
        const text = this.node.textContent
        if (text.trim() === '') {
            // Nothing to render -- fall back to Source. setMode is a no-op
            // if already there (can't happen on the very first call, since
            // this is only reached via setMode(false) having just set
            // mode = 'rendered').
            this.setMode(true)
            return
        }
        // Cache the SANITIZED OUTPUT, not just the input text -- matches
        // MermaidView caching the resolved SVG (this.cached.svg), not
        // re-invoking render() on every paint. Caching input text alone
        // and re-sanitizing on every call was a real bug caught by
        // htmlfrontmatterview.test.js's caching test (sanitize was called
        // twice for one genuine content change, since switching modes
        // back and forth re-ran it on the unchanged cache hit too).
        if (this.lastRenderedText !== text) {
            this.lastRenderedText = text
            this.cachedSanitized = this.sanitize(text, this.purifyConfig)
        }
        this.paintRendered()
    }

    // DOMPurify.sanitize is synchronous, unlike MermaidView's async
    // render() -- no pending/error state, no render-token staleness guard
    // needed. Default DOMPurify config already strips <script>, event
    // handler attributes, and javascript: URLs while permitting the safe
    // HTML a README preamble actually uses (p, img, a, span, br, div, ...).
    paintRendered() {
        if (this.cachedSanitized === null) {
            this.renderedContainer.classList.add(PLACEHOLDER_CLASS)
            this.renderedContainer.textContent = ''
            return
        }
        this.renderedContainer.classList.remove(PLACEHOLDER_CLASS)
        this.renderedContainer.classList.add(RENDERED_CLASS)
        this.renderedContainer.innerHTML = this.cachedSanitized
    }
}
