---
name: writing-markupeditor-plugins
description: Use when building any MarkupEditor plugin, or when unsure whether you need an exporter or a codeview plugin -- covers the shared plugin contract, package.json metadata, testing infrastructure, and which type-specific skill to read next.
---

# Writing MarkupEditor Plugins

**REQUIRED BACKGROUND:** `developing-markupeditorapp` -- read that first if you haven't already; it covers the three-repo architecture this skill assumes.

## Overview

A plugin is a JavaScript module, its own independent npm package under `plugins/<name>/`, that MarkupEditor loads when a document opens. Every plugin declares a `name` and a `type`:

- **`exporter`** -- adds a File → Export transform to another file format. Reference implementation: `plugins/exporter-docx`.
- **`codeview`** -- changes how a fenced code block of a specific language renders inside the live document. Reference implementations: `plugins/codeview-mermaid`, `plugins/codeview-htmlfrontmatter` (the latter is internal -- bundled and auto-loaded, not user-installable; see `writing-codeview-plugins`).

Registration is `MU.registerPlugin({ name, type })` from an `install()` that reads `MU.activeView()` directly. Plugins load via `userScript` well after markupeditor-base's own editor already exists and has already rendered the open document -- neither plugin type gets to assume a fresh, empty editor.

## Which Type Do You Need?

- Rendering a fenced code block as something else (a diagram, live HTML, syntax highlighting) → **REQUIRED SUB-SKILL:** `writing-codeview-plugins`.
- Transforming the document into another file format for export → **REQUIRED SUB-SKILL:** `writing-exporter-plugins`.

## package.json Metadata

Every plugin's `package.json` needs a `markupeditor` object:

```json
{
  "name": "codeview-mermaid",
  "main": "dist/codeview-mermaid.js",
  "description": "MarkupEditor codeview plugin for Mermaid diagrams.",
  "author": "Your Name <you@example.com>",
  "version": "1.0.0",
  "markupeditor": {
    "name": "Mermaid",
    "type": "codeview"
  }
}
```

`name` must match the `name` passed to `MU.registerPlugin(...)` in source exactly -- nothing checks the two stay in sync automatically. `type` is `"exporter"` or `"codeview"`. An exporter additionally needs `ext` (the produced file extension, bare, no leading dot). The directory the plugin lives in under `plugins/` must equal `package.json`'s own `name` field -- a mismatch fails the `plugins.json` generator. Full field reference: `plugins/README.md`.

## Testing

Every plugin's test files live inside its own directory and run via `npm test` (vitest) -- no Xcode involved. `npm install` at the repo root (see `developing-markupeditorapp`'s Setup section) installs and hoists dependencies for every plugin at once, including the shared `markupeditor` package -- run it once from the root, not per-plugin. `plugins/README.md` documents the full tiered pattern (converter unit tests, full-pipeline test, optional real-document fidelity test) established by the DocX exporter.

If your plugin imports anything from a DIFFERENT workspace member directly (not just `markupeditor` itself) -- e.g. the DocX exporter's fidelity test imports `markupeditor-app/src/markdown.js` -- that only resolves to a single, consistent module instance because both sides are hoisted to the one shared root `node_modules/` by the workspace. A plugin with its own separate `node_modules` (outside this workspace) would load two different copies of anything it shares with another member, which breaks in exactly the way you'd expect for stateful modules (double-registration errors, mismatched class identity).

Any test that constructs a real `EditorView` needs `jsdom` -- the real bundle's module-load-time CSS side effects use CSSOM APIs a lighter DOM implementation won't have:

```js
test: { environment: 'jsdom', setupFiles: './test/vitest.setup.js' },
```

Copy `test-setup-shim.js` in this skill's directory to `test/vitest.setup.js` verbatim as a starting point -- it patches the specific jsdom gaps (`CSSStyleSheet.replaceSync`/`.media`, `document.adoptedStyleSheets`, `document.execCommand`) every plugin that's needed this so far has hit.

## Publishing

After merging a plugin PR:

```bash
node plugins/generate-plugins-json.mjs
git add plugins/plugins.json
git commit -m "Update plugins.json"
```

The generator validates every `plugins/<dir>/package.json` against the rules above and fails loudly, naming the offending directory, rather than writing a partial or malformed manifest.
