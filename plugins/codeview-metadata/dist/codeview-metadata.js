import { PluginKey, MU, NodeSelection, Selection, TextSelection, __parseFromClipboard, Plugin } from './markup-editor.js';

const sheet = new CSSStyleSheet();sheet.replaceSync("/* Allow the PDF exporter to hide the bar/toggle chrome when the block is selected,\n   matching codeview-htmlfrontmatter's equivalent rule. */\n#editor.Markup-exporting .metadata-bar,\n#editor.Markup-exporting .metadata-mode-toggle {\n  display: none;\n}\n\n.metadata-bar {\n  display: flex;\n  align-items: center;\n  gap: 6px;\n  padding: 4px 8px;\n  cursor: pointer;\n  user-select: none;\n  background: var(--Markup-secondary-background, #eee);\n  border-radius: 4px 4px 0 0;\n  font-size: 0.85rem;\n  font-weight: 600;\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-bar {\n    background: var(--Markup-secondary-background, #333);\n  }\n}\n\n.metadata-disclosure {\n  display: inline-block;\n  width: 0;\n  height: 0;\n  border-style: solid;\n  border-width: 5px 0 5px 7px;\n  border-color: transparent transparent transparent currentColor;\n  transition: transform 0.1s ease;\n}\n\n.metadata-disclosure-collapsed {\n  transform: rotate(0deg);\n}\n\n.metadata-disclosure:not(.metadata-disclosure-collapsed) {\n  transform: rotate(90deg);\n}\n\n.metadata-label {\n  margin-right: auto; /* pushes Table/Source to the right end of the same line */\n}\n\n.metadata-content {\n  background: var(--Markup-secondary-background, #eee);\n  border-radius: 0 0 4px 4px;\n  padding: 8px;\n  margin-bottom: 8px;\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-content {\n    background: var(--Markup-secondary-background, #333);\n  }\n}\n\n.metadata-content-collapsed {\n  display: none;\n}\n\n.metadata-mode-toggle {\n  font-size: 0.75rem;\n  padding: 2px 8px;\n  border: none;\n  border-radius: 4px;\n  cursor: pointer;\n  opacity: 0.6;\n  color: white;\n  background: var(--Markup-accent-color, blue);\n}\n\n.metadata-mode-toggle:hover {\n  opacity: 0.9;\n}\n\n.metadata-mode-toggle-active {\n  opacity: 0.9;\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-mode-toggle {\n    background: var(--Markup-accent-color, lightblue);\n    color: black;\n  }\n}\n\n.metadata-hide-caret {\n  caret-color: transparent;\n}\n\n/* Hides contentDOM (the editable Source text) in Table mode. contentDOM is\n   a grandchild of the <pre>, moved inside .metadata-content by MetadataView's\n   constructor, so it shares that wrapper's padding with .metadata-table. */\ncode.metadata-hidden-code {\n  font-size: 0;\n  line-height: 0;\n  margin: 0;\n}\n\n/* A CSS grid, not per-row flexboxes: grid-template-columns computes the key\n   column's width once across every row, matching a real <table>'s column\n   sizing. Cells are appended directly as grid children by renderTable(),\n   two per logical row. */\n.metadata-table {\n  display: grid;\n  grid-template-columns: auto 1fr;\n  font-size: 0.85rem;\n  border: 1px solid var(--Markup-border-color, #d0d7de);\n  border-radius: 6px;\n  overflow: hidden;\n}\n\n/* Dashed outline for the selected Table-mode block, matching HTMLFrontMatterView's\n   .htmlfrontmatter-rendered-selected / Mermaid's selected-diagram outline. */\n.metadata-selected {\n  outline: 1px var(--Markup-accent-color, blue) dashed;\n  outline-offset: 2px;\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-selected {\n    outline-color: var(--Markup-accent-color, lightblue);\n  }\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-table {\n    border-color: var(--Markup-border-color, #30363d);\n  }\n}\n\n.metadata-table-key,\n.metadata-table-value {\n  padding: 6px 13px;\n}\n\n.metadata-table-row-border {\n  border-top: 1px solid var(--Markup-border-color, #d0d7de);\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-table-row-border {\n    border-top-color: var(--Markup-border-color, #30363d);\n  }\n}\n\n.metadata-table-striped {\n  background: var(--Markup-table-stripe, #f6f8fa);\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-table-striped {\n    background: var(--Markup-table-stripe, #161b22);\n  }\n}\n\n.metadata-table-key {\n  font-weight: 600;\n  white-space: nowrap;\n  border-right: 1px solid var(--Markup-border-color, #d0d7de);\n}\n\n@media (prefers-color-scheme: dark) {\n  .metadata-table-key {\n    border-right-color: var(--Markup-border-color, #30363d);\n  }\n}\n\n.metadata-table-value {\n  min-width: 0;\n  word-break: break-word;\n}\n\n.metadata-table-empty {\n  font-style: italic;\n  opacity: 0.6;\n}\n");

// Separate module so both metadataview.js (reads/dispatches collapse state)
// and metadataplugin.js (owns the Plugin whose state this keys into) can
// import it without a circular dependency between the two.
const metadataPluginKey = new PluginKey('metadata');

const METADATA_LANGUAGE = 'metadata';

// Matched trimmed and case-insensitively, as the metadata codeview does.
function isMetadataLanguage(language) {
    return (language ?? '').trim().toLowerCase() === METADATA_LANGUAGE
}

// Strips quotes and unescapes a scalar token, as YAMLMetadata.parseScalar (Swift) does.
function parseScalar(token) {
    if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
        return token.slice(1, -1).replace(/\\(["\\])/g, '$1')
    }
    if (token.length >= 2 && token.startsWith("'") && token.endsWith("'")) {
        return token.slice(1, -1).replace(/''/g, "'")
    }
    return token
}

// Splits a flow sequence (`[a, "b, c", d]`) on commas outside quotes. A quote only opens at
// the start of an item, so an apostrophe inside a bare word ("don't") is literal.
function parseFlowSequence(text) {
    let inner = text.trim();
    if (inner.startsWith('[')) inner = inner.slice(1);
    if (inner.endsWith(']')) inner = inner.slice(0, -1);
    const items = [];
    let current = '';
    let quote = null;
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i];
        if (quote) {
            current += ch;
            if (quote === '"' && ch === '\\' && i + 1 < inner.length) current += inner[++i];
            else if (ch === quote) quote = null;
        } else if ((ch === '"' || ch === "'") && current.trim() === '') {
            quote = ch;
            current += ch;
        } else if (ch === ',') {
            items.push(parseScalar(current.trim()));
            current = '';
        } else {
            current += ch;
        }
    }
    if (current.trim()) items.push(parseScalar(current.trim()));
    return items
}

// Best-effort frontmatter parser for the constructs YAMLMetadata.parse (Swift) handles: scalar
// values (quotes stripped, escapes undone), flow sequences ("key: [a, b]") and block sequences
// ("key:" followed by "- item" lines). Returns ordered {key, value} entries with the key as
// typed; a scalar value is a string and a sequence a string array. Not a full YAML parser, and
// not a round-trip: it only reads values back out.
function parseFrontmatterEntries(text) {
    const entries = [];
    const lines = (text ?? '').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith('#') || line === '---') continue
        if (line.endsWith(': |') || line.endsWith(': >')) continue
        const match = line.match(/^([^:\s][^:]*):\s?(.*)$/);
        if (!match) continue
        const key = match[1].trim();
        const rawValue = match[2].trim();
        if (rawValue === '') {
            const items = [];
            let j = i + 1;
            while (j < lines.length) {
                const next = lines[j].trim();
                if (next.startsWith('- ')) items.push(parseScalar(next.slice(2).trim()));
                else if (next !== '') break
                j++;
            }
            if (items.length) {
                entries.push({ key, value: items });
                i = j - 1;
            } else {
                entries.push({ key, value: '' });
            }
        } else if (rawValue.startsWith('[')) {
            entries.push({ key, value: parseFlowSequence(rawValue) });
        } else {
            entries.push({ key, value: parseScalar(rawValue) });
        }
    }
    return entries
}

// The string form of a value that is expected to be a scalar (title, language, ...); a sequence
// written there is joined instead of reaching an XML/document writer as an array.
function metadataScalar(value) {
    return Array.isArray(value) ? value.join(', ') : (value ?? '')
}

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

// Instances register themselves in the constructor, deregister in
// destroy(). ProseMirror does not call a NodeView's update() for a pure
// position shift, so position and collapse-state sync run from the
// Plugin's view-update hook instead, which fires on every transaction.
const liveInstances = new Set();

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
class MetadataView extends MU.CodeView {
    constructor(node, view, getPos, languageDialog) {
        super(node, view, getPos, languageDialog);
        this.getPos = getPos;
        this.node = node;
        this.mode = null; // setMode(true) below sets the real value; starting at 'table' would make its no-op guard skip initial DOM class application
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

        // Clicking Table/Source while collapsed also expands, rather than being a no-op.
        this.tableTab = this.buildModeTab('Table', 'table', () => { this.ensureExpanded(); this.setMode(true); });
        this.sourceTab = this.buildModeTab('Source', 'source', () => { this.ensureExpanded(); this.setMode(false); });
        this.bar.appendChild(this.tableTab);
        this.bar.appendChild(this.sourceTab);

        this.content = document.createElement('div');
        this.content.className = CONTENT_CLASS;

        this.tableContainer = document.createElement('div');
        this.tableContainer.className = TABLE_CLASS;
        this.tableContainer.contentEditable = 'false';

        // contentDOM starts as a child of dom (base CodeView constructor);
        // appendChild here moves it into content, as a sibling of
        // tableContainer, so Table and Source share the same padding.
        this.dom.appendChild(this.bar);
        this.dom.appendChild(this.content);
        this.content.appendChild(this.tableContainer);
        this.content.appendChild(this.contentDOM);

        this.setMode(true); // Table default
        this.syncCollapsedFromPluginState();
        this.renderTable();
    }

    update(node) {
        // super.update() -> syncLanguageClass() overwrites contentDOM.className
        // entirely, wiping HIDDEN_CODE_CLASS on every keystroke. Re-apply
        // after calling super, not just at construction/setMode time.
        const handled = super.update(node);
        if (!handled) return false
        this.node = node;
        this.contentDOM.classList.toggle(HIDDEN_CODE_CLASS, this.mode === 'table');
        if (this.mode === 'table') this.renderTable();
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
        this.isActive = isActive;
    }

    // Toggles the whole-block selected outline from live selection state,
    // called from the Plugin's view-update hook on every transaction.
    // Applied to dom (the whole block), matching Mermaid's/HTMLFrontMatterView's
    // selected outline.
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

    // Called from the Plugin's view-update hook on every transaction, since
    // a pure position shift never reaches update() (see class doc comment).
    static checkAllPositions() {
        for (const instance of liveInstances) {
            if (instance.getPos() !== 0) instance.forcePlainOnly();
        }
    }

    static syncAllCollapsedState() {
        for (const instance of liveInstances) instance.syncCollapsedFromPluginState();
    }

    // Idempotent, one-way: once no longer at position 0, this instance
    // never shows the bar/Table/Source chrome again. Undo back to position
    // 0 constructs a fresh instance via the factory.
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

    // Expands if collapsed; no-op if already expanded. Lets Table/Source tab
    // clicks reveal a collapsed block without re-collapsing an expanded one.
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

    // Explicit SET, not a toggle -- matches HTMLFrontMatterView's setMode.
    setMode(isTable) {
        const nextMode = isTable ? 'table' : 'source';
        if (nextMode === this.mode) return
        this.mode = nextMode;
        this.syncModeClasses();
        // A tab click dispatches no transaction, so the view-update hook
        // won't fire from this alone -- resync the outline against the
        // current selection.
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
        const rows = parseFrontmatterEntries(this.node.textContent);
        this.tableContainer.replaceChildren();
        this.tableContainer.classList.toggle(TABLE_EMPTY_CLASS, rows.length === 0);
        if (rows.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = 'No metadata';
            this.tableContainer.appendChild(empty);
            return
        }
        // Cells are direct children of tableContainer (a CSS grid, not
        // per-row flexboxes) so the key column's width is computed once
        // across every row.
        rows.forEach(({ key, value }, index) => {
            const striped = index % 2 === 1;
            const keyEl = document.createElement('span');
            keyEl.className = 'metadata-table-key' + (striped ? ' metadata-table-striped' : '');
            keyEl.textContent = key;
            const valueEl = document.createElement('span');
            valueEl.className = 'metadata-table-value' + (striped ? ' metadata-table-striped' : '');
            valueEl.textContent = metadataScalar(value);
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
    // HTMLFrontMatterView's rendered mode): contentDOM is present but visually
    // collapsed to nothing, so without this the caret can silently land
    // inside it via arrow-key navigation or typing. Source mode is ordinary
    // text editing and is not atomic.
    tableBlockAt(view, pos) {
        const instance = this.metadataViewAt(view, pos);
        return instance?.mode === 'table' ? instance : null
    }

    // Plain ArrowLeft/ArrowRight treats a Table-mode code_block as a single
    // atomic hop, like an image. Mirrors MermaidPlugin.handleDiagramArrowKey
    // / HTMLFrontMatterPlugin.handleHTMLFrontMatterArrowKey.
    handleMetadataArrowKey(view, event) {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return false
        if (event.shiftKey || event.metaKey || event.altKey || event.ctrlKey) return false
        const { state } = view;
        const sel = state.selection;
        const dir = event.key === 'ArrowLeft' ? -1 : 1;

        // Already parked on a table block (a NodeSelection) -- arrow away
        // from it to whichever side dir points.
        if (sel instanceof NodeSelection && this.tableBlockAt(view, sel.from)) {
            const targetPos = dir < 0 ? sel.from : sel.to;
            if (targetPos < 0 || targetPos > state.doc.content.size) return false
            const newSel = Selection.near(state.doc.resolve(targetPos), dir);
            view.dispatch(state.tr.setSelection(newSel).scrollIntoView());
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
        const targetPos = sel.from + dir;
        if (targetPos < 0 || targetPos > state.doc.content.size) return false
        let blockPos = null;
        const $target = state.doc.resolve(targetPos);
        if ($target.depth === 0) {
            const before = $target.nodeBefore;
            if (before && before.type.name === 'code_block') blockPos = targetPos - before.nodeSize;
        }
        if (blockPos === null || !this.tableBlockAt(view, blockPos)) return false
        // Whole-node selection, not a text cursor inside the (hidden)
        // content -- matches how an atomic node like an image behaves.
        // code_block's schema isn't atomic, so this is simulated at the
        // plugin level via NodeSelection.create, which works for any node
        // type regardless of atomicity.
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
        // Landing on a table block via arrow key creates a NodeSelection
        // (see handleMetadataArrowKey); recognizing it here keeps this
        // plugin's clipboard path explicit rather than relying on
        // ProseMirror's default NodeSelection.content() serialization.
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
    // / HTMLFrontMatterPlugin.handleHTMLFrontMatterCopy.
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
    // reasoning as MermaidPlugin/HTMLFrontMatterPlugin.
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

    // On macOS, Cmd+V never reaches the DOM as a paste event when the
    // selection is inside a <pre> -- MarkupWKWebView.swift routes it
    // through MU.pasteCode instead. Wrapping MU.pasteCode catches this
    // regardless of which path fires. Mirrors MermaidPlugin/
    // HTMLFrontMatterPlugin's own wrapper.
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
                // the only production path that does. Detecting it resets
                // collapse to expanded for the new document, since this
                // Plugin's state persists across document loads and would
                // otherwise carry a prior document's collapse choice into
                // the next one.
                apply: (tr, value) => {
                    if (tr.getMeta('addToHistory') === false) return { collapsed: false }
                    const meta = tr.getMeta(metadataPluginKey);
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
                const oldFirst = oldState.doc.firstChild;
                const wasMetadata = oldFirst && oldFirst.type.name === 'code_block' && isMetadataLanguage(oldFirst.attrs.language);
                if (!wasMetadata) return null
                const first = newState.doc.firstChild;
                if (!first || first.type.name !== 'code_block') return null // deletion/displacement -- not this guard's concern
                if (isMetadataLanguage(first.attrs.language)) return null
                return newState.tr.setNodeMarkup(0, undefined, { ...first.attrs, language: METADATA_LANGUAGE })
            },
            view: (editorView) => {
                // Hides the native caret whenever the selection is inside a
                // Table-mode block's (invisible) contentDOM --
                // belt-and-suspenders alongside the arrow-key/delete
                // handling above, for a selection that lands there some
                // other way (e.g. a mouse click). Mirrors MermaidPlugin/
                // HTMLFrontMatterPlugin.
                const syncCaretClass = (v) => {
                    const sel = v.state.selection;
                    let hideCaret = false;
                    if (sel instanceof TextSelection && sel.$from.depth > 0 && sel.$from.parent.type.name === 'code_block') {
                        hideCaret = !!this.tableBlockAt(v, sel.$from.before(sel.$from.depth));
                    }
                    v.dom.classList.toggle(HIDE_CARET_CLASS, hideCaret);
                };
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
                    syncCaretClass(v);
                    MetadataView.checkAllPositions();
                    MetadataView.syncAllCollapsedState();
                    // codeLanguageTabPlugin's setActive callback is
                    // TextSelection-inside-only per its own doc comment,
                    // never a NodeSelection -- exactly the kind a
                    // Table-mode block now creates, so the selected
                    // outline is driven directly from live selection state
                    // here instead.
                    MetadataView.syncAllSelectedState(v.state);
                };
                // Also run once at construction: covers the case where the
                // document's initial/default selection on load already
                // lands inside a table block.
                if (!this.correctStraySelection(editorView)) {
                    syncCaretClass(editorView);
                    MetadataView.syncAllSelectedState(editorView.state);
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
