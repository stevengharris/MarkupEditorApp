import { PluginKey, MU, NodeSelection, Selection, TextSelection, __parseFromClipboard, Plugin } from './markup-editor.js';

const sheet = new CSSStyleSheet();sheet.replaceSync("/* Allow the PDF exporter to hide the bar/toggle chrome when the block is selected,\n   matching markupeditor-codeview-frontmatter's equivalent rule. */\n#editor.Markup-exporting .metadata-bar,\n#editor.Markup-exporting .metadata-mode-toggle {\n  display: none;\n}\n\n.metadata-bar {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 8px;\n  cursor: pointer;\n  user-select: none;\n  background: var(--Markup-secondary-background, #eee);\n  border-radius: 4px 4px 0 0;\n  font-size: 0.85rem;\n  font-weight: 600;\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-bar {\n    background: var(--Markup-secondary-background, #333);\n  }\n}\n\n.metadata-disclosure {\n  display: inline-block;\n  width: 0;\n  height: 0;\n  border-style: solid;\n  border-width: 5px 0 5px 7px;\n  border-color: transparent transparent transparent currentColor;\n  transition: transform 0.1s ease;\n}\n\n.metadata-disclosure-collapsed {\n  transform: rotate(0deg);\n}\n\n.metadata-disclosure:not(.metadata-disclosure-collapsed) {\n  transform: rotate(90deg);\n}\n\n.metadata-label {\n  margin-right: auto; /* pushes Table/Source to the right end of the same line */\n}\n\n.metadata-content {\n  background: var(--Markup-secondary-background, #eee);\n  border-radius: 0 0 4px 4px;\n  padding: 8px;\n  margin-bottom: 8px;\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-content {\n    background: var(--Markup-secondary-background, #333);\n  }\n}\n\n.metadata-content-collapsed {\n  display: none;\n}\n\n.metadata-mode-toggle {\n  font-size: 0.75rem;\n  padding: 2px 8px;\n  border: none;\n  border-radius: 4px;\n  cursor: pointer;\n  opacity: 0.6;\n  color: white;\n  background: var(--Markup-accent-color, blue);\n}\n\n.metadata-mode-toggle:hover {\n  opacity: 0.9;\n}\n\n.metadata-mode-toggle-active {\n  opacity: 0.9;\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-mode-toggle {\n    background: var(--Markup-accent-color, lightblue);\n    color: black;\n  }\n}\n\n.metadata-hide-caret {\n  caret-color: transparent;\n}\n\n/* Table mode: hide contentDOM (the actual editable Source text). No direct-child\n   combinator here -- contentDOM lives inside .metadata-content (moved there by\n   MetadataView's constructor, a grandchild of the <pre>, not a direct child),\n   so it shares that wrapper's padding with .metadata-table and reads at the\n   same position/inset regardless of which mode is showing. */\ncode.metadata-hidden-code {\n  font-size: 0;\n  line-height: 0;\n  margin: 0;\n}\n\n/* GitHub-style bordered table for the frontmatter key/value rows: full grid\n   lines and zebra striping, matching how GitHub itself renders a markdown\n   table (github.com's markdown-body CSS: 1px bordered cells, alternating\n   row background). A real CSS grid, not per-row flexboxes -- grid-template-\n   columns computes the key column's width ONCE across every row's content,\n   the same column-sizing behavior a real <table> has; independent per-row\n   flex rows can't reproduce that (each would size only to its own text,\n   producing a jagged, unaligned column edge). Cells are appended directly\n   as grid children by renderTable(), two per logical row, rather than\n   wrapped in a per-row element.  */\n.metadata-table {\n  display: grid;\n  grid-template-columns: auto 1fr;\n  font-size: 0.85rem;\n  border: 1px solid var(--Markup-border-color, #d0d7de);\n  border-radius: 6px;\n  overflow: hidden;\n}\n\n/* Dashed outline while active/selected -- matches FrontMatterView's\n   .frontmatter-rendered-selected / Mermaid's own selected-diagram outline,\n   the visual indicator a Table-mode block (an atomic unit for keyboard\n   navigation) is currently the selection, since it draws no native caret. */\n.metadata-selected {\n  outline: 1px var(--Markup-accent-color, blue) dashed;\n  outline-offset: 2px;\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-selected {\n    outline-color: var(--Markup-accent-color, lightblue);\n  }\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-table {\n    border-color: var(--Markup-border-color, #30363d);\n  }\n}\n\n.metadata-table-key,\n.metadata-table-value {\n  padding: 6px 13px;\n}\n\n.metadata-table-row-border {\n  border-top: 1px solid var(--Markup-border-color, #d0d7de);\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-table-row-border {\n    border-top-color: var(--Markup-border-color, #30363d);\n  }\n}\n\n.metadata-table-striped {\n  background: var(--Markup-table-stripe, #f6f8fa);\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-table-striped {\n    background: var(--Markup-table-stripe, #161b22);\n  }\n}\n\n.metadata-table-key {\n  font-weight: 600;\n  white-space: nowrap;\n  border-right: 1px solid var(--Markup-border-color, #d0d7de);\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-table-key {\n    border-right-color: var(--Markup-border-color, #30363d);\n  }\n}\n\n.metadata-table-value {\n  min-width: 0;\n  word-break: break-word;\n}\n\n.metadata-table-empty {\n  font-style: italic;\n  opacity: 0.6;\n}\n");

// Separate module so both metadataview.js (reads/dispatches collapse state)
// and metadataplugin.js (owns the Plugin whose state this keys into) can
// import it without a circular dependency between the two.
const metadataPluginKey = new PluginKey('metadata');

const BAR_CLASS = 'metadata-bar';
const DISCLOSURE_CLASS = 'metadata-disclosure';
const DISCLOSURE_COLLAPSED_CLASS = 'metadata-disclosure-collapsed';
const LABEL_CLASS = 'metadata-label';
const CONTENT_CLASS = 'metadata-content';
const CONTENT_COLLAPSED_CLASS = 'metadata-content-collapsed';
const TAB_CLASS = 'metadata-mode-toggle';
const TAB_ACTIVE_CLASS = 'metadata-mode-toggle-active';
const HIDDEN_CODE_CLASS = 'metadata-hidden-code';
const TABLE_CLASS = 'metadata-table';
const TABLE_EMPTY_CLASS = 'metadata-table-empty';
const SELECTED_CLASS = 'metadata-selected';

function isMetadataLanguage(language) {
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
function parseMetadataRows(text) {
    const rows = [];
    for (const rawLine of (text ?? '').split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line === '---') continue
        const match = line.match(/^([^:\s][^:]*):\s?(.*)$/);
        if (!match) continue
        rows.push({ key: match[1].trim(), value: match[2].trim() });
    }
    return rows
}

// Instances add themselves in the constructor, remove themselves in
// destroy(). Needed for the same reason as FrontMatterView's liveInstances:
// ProseMirror does NOT call a NodeView's own update() for a PURE position
// shift, so position enforcement and collapse-state sync both have to be
// driven from MetadataPlugin's Plugin view-update hook (which DOES fire on
// every transaction) rather than update() alone.
const liveInstances = new Set();

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
class MetadataView extends MU.CodeView {
    constructor(node, view, getPos, languageDialog) {
        super(node, view, getPos, languageDialog);
        this.getPos = getPos;
        this.node = node;
        this.mode = null; // set for real by setMode(true) below -- must NOT start equal to 'table', or that call's no-op guard would skip applying the initial DOM classes entirely
        this.isActive = false;
        this.positionValid = true; // factory only ever constructs this when getPos() === 0 already holds

        liveInstances.add(this);

        this.bar = document.createElement('div');
        this.bar.className = BAR_CLASS;
        this.bar.contentEditable = 'false';

        this.disclosure = document.createElement('span');
        this.disclosure.className = DISCLOSURE_CLASS;

        this.label = document.createElement('span');
        this.label.className = LABEL_CLASS;
        this.label.textContent = 'Metadata';

        this.bar.appendChild(this.disclosure);
        this.bar.appendChild(this.label);
        this.bar.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // don't also let ProseMirror reposition the selection from this click
            this.toggleCollapsed();
        });

        // Clicking Table/Source while collapsed also expands -- the click is a clear signal
        // the user wants to see that content now, not a no-op hidden behind the collapse bar.
        this.tableTab = this.buildModeTab('Table', 'table', () => { this.ensureExpanded(); this.setMode(true); });
        this.sourceTab = this.buildModeTab('Source', 'source', () => { this.ensureExpanded(); this.setMode(false); });
        this.bar.appendChild(this.tableTab);
        this.bar.appendChild(this.sourceTab);

        this.content = document.createElement('div');
        this.content.className = CONTENT_CLASS;

        this.tableContainer = document.createElement('div');
        this.tableContainer.className = TABLE_CLASS;
        this.tableContainer.contentEditable = 'false';

        // contentDOM starts as a direct child of dom (the base CodeView
        // constructor put it there); appendChild here MOVES it into content,
        // as a sibling of tableContainer, so Table and Source share the same
        // padded wrapper -- keeps spacing identical between the two modes
        // instead of contentDOM sitting outside content's padding box.
        this.dom.appendChild(this.bar);
        this.dom.appendChild(this.content);
        this.content.appendChild(this.tableContainer);
        this.content.appendChild(this.contentDOM);

        this.setMode(true); // Table default
        this.syncCollapsedFromPluginState();
        this.renderTable();
    }

    update(node) {
        // Regression: super.update() -> syncLanguageClass() does
        // `this.contentDOM.className = ...`, a full overwrite rather than an
        // additive change -- it silently wipes out HIDDEN_CODE_CLASS on
        // every content update (i.e. every keystroke while positioned
        // inside contentDOM), unhiding the raw Source text while
        // tableContainer is still also showing. Re-apply after, not just at
        // construction/setMode time.
        const handled = super.update(node);
        if (!handled) return false
        this.node = node;
        this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, this.mode === 'table');
        if (this.mode === 'table') this.renderTable();
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
        this.isActive = isActive;
    }

    // Toggles the whole-block selected outline directly from live selection
    // state (called from MetadataPlugin's Plugin view-update hook on every
    // transaction), not from setActive. Applied to `dom` (the whole <pre> --
    // bar, content, contentDOM together), not just tableContainer, so the
    // outline reads as "this whole block is selected," matching Mermaid's/
    // FrontMatterView's own selected-diagram/-block outline.
    syncSelectedFromState(state) {
        if (!this.positionValid) return
        const sel = state.selection;
        const selected = sel instanceof NodeSelection && sel.from === this.getPos();
        this.dom.classList.toggle(SELECTED_CLASS, selected && this.mode === 'table');
    }

    static syncAllSelectedState(state) {
        for (const instance of liveInstances) instance.syncSelectedFromState(state);
    }

    destroy() {
        liveInstances.delete(this);
        super.destroy();
    }

    // The actual position-0 enforcement mechanism -- called from
    // MetadataPlugin's Plugin view-update hook on every transaction, since
    // a pure position shift never reaches update() at all (see class doc
    // comment).
    static checkAllPositions() {
        for (const instance of liveInstances) {
            if (instance.getPos() !== 0) instance.forcePlainOnly();
        }
    }

    static syncAllCollapsedState() {
        for (const instance of liveInstances) instance.syncCollapsedFromPluginState();
    }

    // Idempotent, one-way: once a block is no longer at position 0, it
    // never shows the bar/Table/Source chrome again for the lifetime of
    // this instance (undo back to position 0 constructs a fresh instance
    // via the factory, which re-evaluates the position check from scratch)
    // -- it just renders as an ordinary code block from then on.
    forcePlainOnly() {
        if (!this.positionValid) return
        this.positionValid = false;
        this.dom.appendChild(this.contentDOM); // re-parent back under dom directly -- it currently lives inside content, which is about to be removed
        if (this.dom.contains(this.bar)) this.dom.removeChild(this.bar);
        if (this.dom.contains(this.content)) this.dom.removeChild(this.content);
        this.contentDOM.classList.remove(HIDDEN_CODE_CLASS);
    }

    toggleCollapsed() {
        if (!this.positionValid) return
        const current = metadataPluginKey.getState(this.view.state)?.collapsed ?? false;
        this.view.dispatch(this.view.state.tr.setMeta(metadataPluginKey, { collapsed: !current }));
    }

    // One-directional: expands if currently collapsed, does nothing if already expanded.
    // Used by the Table/Source tabs so clicking one while collapsed reveals it, without
    // accidentally re-collapsing an already-expanded block.
    ensureExpanded() {
        if (!this.positionValid) return
        const current = metadataPluginKey.getState(this.view.state)?.collapsed ?? false;
        if (current) this.view.dispatch(this.view.state.tr.setMeta(metadataPluginKey, { collapsed: false }));
    }

    syncCollapsedFromPluginState() {
        if (!this.positionValid) return
        const collapsed = metadataPluginKey.getState(this.view.state)?.collapsed ?? false;
        this.disclosure.classList.toggle(DISCLOSURE_COLLAPSED_CLASS, collapsed);
        this.content.classList.toggle(CONTENT_COLLAPSED_CLASS, collapsed);
    }

    buildModeTab(label, tabType, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = TAB_CLASS;
        button.dataset.tab = tabType;
        button.contentEditable = 'false';
        button.textContent = label;
        button.addEventListener('mousedown', (e) => {
            e.preventDefault();
            e.stopPropagation(); // don't also let ProseMirror reposition the selection from this click
            onClick();
        });
        return button
    }

    // Explicit SET, not a toggle -- matches FrontMatterView's setMode.
    setMode(isTable) {
        const nextMode = isTable ? 'table' : 'source';
        if (nextMode === this.mode) return
        this.mode = nextMode;
        this.syncModeClasses();
        // A Table/Source tab click dispatches no transaction of its own, so the Plugin's
        // view-update hook won't fire from this alone -- resync the outline immediately
        // against the CURRENT (unchanged) selection, now that mode has moved.
        this.syncSelectedFromState(this.view.state);
        if (this.mode === 'table') this.renderTable();
    }

    syncModeClasses() {
        this.view.domObserver?.stop();
        try {
            const isTable = this.mode === 'table';
            this.tableTab.classList.toggle(TAB_ACTIVE_CLASS, isTable);
            this.sourceTab.classList.toggle(TAB_ACTIVE_CLASS, !isTable);
            this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, isTable);
            this.tableContainer.style.display = isTable ? '' : 'none';
        } finally {
            this.view.domObserver?.start();
        }
    }

    renderTable() {
        const rows = parseMetadataRows(this.node.textContent);
        this.tableContainer.replaceChildren();
        this.tableContainer.classList.toggle(TABLE_EMPTY_CLASS, rows.length === 0);
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No metadata';
            this.tableContainer.appendChild(empty);
            return
        }
        // Cells are direct children of tableContainer (a CSS grid, not
        // per-row flexboxes) so the key column's width is computed ONCE
        // across every row's content -- a real <table>'s column-sizing
        // behavior, which independent per-row flex rows can't reproduce
        // (each would size its own key cell to only its own text).
        rows.forEach(({ key, value }, index) => {
            const striped = index % 2 === 1;
            const keyEl = document.createElement('span');
            keyEl.className = 'metadata-table-key' + (striped ? ' metadata-table-striped' : '');
            keyEl.textContent = key;
            const valueEl = document.createElement('span');
            valueEl.className = 'metadata-table-value' + (striped ? ' metadata-table-striped' : '');
            valueEl.textContent = value;
            if (index > 0) {
                keyEl.classList.add('metadata-table-row-border');
                valueEl.classList.add('metadata-table-row-border');
            }
            this.tableContainer.appendChild(keyEl);
            this.tableContainer.appendChild(valueEl);
        });
    }
}

const HIDE_CARET_CLASS = 'metadata-hide-caret';

class MetadataPlugin {

    adoptMetadataStyles(view) {
        const root = view.dom.getRootNode();
        if (!root.adoptedStyleSheets?.includes(sheet)) {
            root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
        }
    }

    // Return the MetadataView at pos in the view, or null.
    metadataViewAt(view, pos) {
        const instance = view.nodeDOM(pos)?.codeView;
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
        const instance = this.metadataViewAt(view, pos);
        return instance?.mode === 'table' ? instance : null
    }

    // Plain ArrowLeft/ArrowRight treats a Table-mode code_block as a single
    // atomic hop, like an image. Mirrors MermaidPlugin.handleDiagramArrowKey
    // / FrontMatterPlugin.handleFrontMatterArrowKey.
    handleMetadataArrowKey(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view;
        const sel = state.selection;
        const dir = event.key === 'ArrowLeft' ? -1 : 1;

        // Already parked ON a table block (a NodeSelection -- see the landing
        // case below) -- arrow away from it to whichever side dir points.
        if (sel instanceof NodeSelection && this.tableBlockAt(view, sel.from)) {
            const targetPos = dir < 0 ? sel.from : sel.to;
            if (targetPos < 0 || targetPos > state.doc.content.size) return false
            const newSel = Selection.near(state.doc.resolve(targetPos), dir);
            view.dispatch(state.tr.setSelection(newSel).scrollIntoView());
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
        const targetPos = sel.from + dir;
        if (targetPos < 0 || targetPos > state.doc.content.size) return false
        let blockPos = null;
        const $target = state.doc.resolve(targetPos);
        if ($target.depth === 0) {
            const before = $target.nodeBefore;
            if (before && before.type.name === 'code_block') blockPos = targetPos - before.nodeSize;
        }
        if (blockPos === null || !this.tableBlockAt(view, blockPos)) return false
        // Whole-node selection, not a text cursor inside the (hidden) content: selectable,
        // not directly editable, matching how an atomic node like an image behaves.
        // code_block's schema isn't atomic (Source mode needs real editable text), so this
        // is simulated at the plugin level -- NodeSelection.create works for any node type
        // regardless of atomicity, unlike Selection.near, which always prefers a text
        // position when one exists (why the "hop out" branch above still needs
        // TextSelection handling -- that's leaving an existing text cursor, not landing).
        const newSel = NodeSelection.create(state.doc, blockPos);
        view.dispatch(state.tr.setSelection(newSel).scrollIntoView());
        return true
    }

    // Delete/Backspace on (or adjacent to) a Table-mode block removes the
    // WHOLE block atomically. Mirrors MermaidPlugin.handleDiagramDeleteKey.
    handleMetadataDeleteKey(view, event) {
        if (event.key !== 'Delete' && event.key !== 'Backspace') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view;
        const sel = state.selection;
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
        const targetPos = sel.from - 1;
        if (targetPos < 0 || targetPos > state.doc.content.size) return false
        const $target = state.doc.resolve(targetPos);
        if ($target.depth !== 0) return false
        const before = $target.nodeBefore;
        if (!before || before.type.name !== 'code_block') return false
        const blockPos = targetPos - before.nodeSize;
        if (!this.tableBlockAt(view, blockPos)) return false
        view.dispatch(state.tr.delete(blockPos, targetPos).scrollIntoView());
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
        const sel = view.state.selection;
        if (!(sel instanceof TextSelection)) return false
        if (sel.$from.depth === 0 || sel.$from.parent.type.name !== 'code_block') return false
        const blockPos = sel.$from.before(sel.$from.depth);
        if (!this.tableBlockAt(view, blockPos)) return false
        view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, blockPos)));
        return true
    }

    selectedTableBlockPos(view) {
        const sel = view.state.selection;
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
        const blockPos = sel.$from.before(sel.$from.depth);
        return this.tableBlockAt(view, blockPos) ? blockPos : null
    }

    // Blocks direct text insertion while a table block is whole-node
    // selected -- "selectable, not editable": without this, ProseMirror's
    // default behavior for typing over a NodeSelection deletes the node and
    // replaces it with the typed text.
    handleMetadataTextInput(view) {
        const sel = view.state.selection;
        return sel instanceof NodeSelection && !!this.tableBlockAt(view, sel.from)
    }

    // Writes the whole node to the clipboard, matching MermaidPlugin.handleDiagramCopy
    // / FrontMatterPlugin.handleFrontMatterCopy.
    handleMetadataCopy(view, event) {
        const blockPos = this.selectedTableBlockPos(view);
        if (blockPos === null) return false
        const node = view.state.doc.nodeAt(blockPos);
        if (!node) return false
        const slice = NodeSelection.create(view.state.doc, blockPos).content();
        const { dom, text } = view.serializeForClipboard(slice);
        event.clipboardData?.clearData();
        event.clipboardData?.setData('text/html', dom.innerHTML);
        event.clipboardData?.setData('text/plain', text);
        event.preventDefault();
        return false
    }

    handleMetadataCut(view, event) {
        const blockPos = this.selectedTableBlockPos(view);
        if (blockPos === null) return false
        this.handleMetadataCopy(view, event);
        const node = view.state.doc.nodeAt(blockPos);
        if (node) view.dispatch(view.state.tr.delete(blockPos, blockPos + node.nodeSize).scrollIntoView().setMeta('uiEvent', 'cut'));
        return false
    }

    // Registered via handleDOMEvents.paste, not the handlePaste prop -- same
    // reasoning as MermaidPlugin/FrontMatterPlugin.
    handleMetadataPaste(view, event) {
        const blockPos = this.selectedTableBlockPos(view);
        if (blockPos === null) return false
        const node = view.state.doc.nodeAt(blockPos);
        if (!node) return false
        const data = event.clipboardData;
        if (!data) return false
        const text = data.getData('text/plain') || data.getData('Text');
        const html = data.getData('text/html');
        const contentSel = TextSelection.create(view.state.doc, blockPos + 1, blockPos + node.nodeSize - 1);
        const slice = __parseFromClipboard(view, text, html, false, contentSel.$from);
        if (!slice) return false
        const tr = view.state.tr.setSelection(contentSel).replaceSelection(slice);
        view.dispatch(tr.scrollIntoView());
        event.preventDefault();
        return false
    }

    // On macOS, Cmd+V never reaches the DOM as a paste event when the selection is
    // inside a <pre> (MarkupWKWebView.swift routes it through MU.pasteCode instead) --
    // wrapping MU.pasteCode itself catches this regardless of which path fires.
    // Mirrors MermaidPlugin.wrapPasteCodeForDiagram / FrontMatterPlugin.wrapPasteCodeForFrontMatter.
    wrapPasteCodeForMetadata(view) {
        const originalPasteCode = MU.pasteCode;
        MU.pasteCode = (text) => {
            const blockPos = this.selectedTableBlockPos(view);
            if (blockPos === null) return originalPasteCode(text)
            const node = view.state.doc.nodeAt(blockPos);
            const from = blockPos + 1;
            const to = blockPos + node.nodeSize - 1;
            const tr = text ? view.state.tr.replaceWith(from, to, view.state.schema.text(text)) : view.state.tr.delete(from, to);
            view.dispatch(tr.scrollIntoView());
        };
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
        const delegateUpdate = instance.update.bind(instance);
        instance.update = (node) => (isMetadataLanguage(node.attrs.language) && getPos() === 0) ? false : delegateUpdate(node);
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
                    const meta = tr.getMeta(metadataPluginKey);
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
                const oldFirst = oldState.doc.firstChild;
                const wasMetadata = oldFirst && oldFirst.type.name === 'code_block' && isMetadataLanguage(oldFirst.attrs.language);
                if (!wasMetadata) return null
                const first = newState.doc.firstChild;
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
                    const sel = v.state.selection;
                    let hideCaret = false;
                    if (sel instanceof TextSelection && sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
                        hideCaret = !!this.tableBlockAt(v, sel.$from.before(sel.$from.depth));
                    }
                    v.dom.classList.toggle(HIDE_CARET_CLASS, hideCaret);
                };
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
                    syncCaretClass(v);
                    MetadataView.checkAllPositions();
                    MetadataView.syncAllCollapsedState();
                    // codeLanguageTabPlugin's setActive callback (CodeView's usual
                    // selected-instance signal) is TextSelection-inside-only per its own
                    // doc comment, never a NodeSelection -- exactly the selection kind
                    // landing on a Table-mode block now creates, so the selected outline
                    // is driven directly from live selection state here instead.
                    MetadataView.syncAllSelectedState(v.state);
                };
                // Also run once at construction, not just on subsequent transactions --
                // covers the (currently unhandled, separately tracked) case where the
                // document's own initial/default selection on load already happens to
                // land inside a table block, same as onUpdate would catch afterward.
                if (!this.correctStraySelection(editorView)) {
                    syncCaretClass(editorView);
                    MetadataView.syncAllSelectedState(editorView.state);
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
        const view = MU.activeView();
        if (!view) return

        this.adoptMetadataStyles(view);

        const codeBlockFactory = this.makeCodeBlockFactory(view.props.nodeViews.code_block, MU.languageDialog);
        view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: codeBlockFactory } });
        this.wrapPasteCodeForMetadata(view);

        const plugin = this.createPlugin();
        view.updateState(view.state.reconfigure({ plugins: [plugin, ...view.state.plugins] }));
    }
}

const metadataPlugin = new MetadataPlugin();

metadataPlugin.install();

export { MetadataPlugin, isMetadataLanguage, metadataPlugin };
