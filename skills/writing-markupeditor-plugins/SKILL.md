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

## Debugging

**Plugin appears to do nothing, or the Swift side reports "plugin returned no result."** `MU.runPlugin(name)` looks up plugins by exact string match and returns `null` on a miss -- no thrown error, no console output. Check `package.json`'s `markupeditor.name` against the name passed to `MU.registerPlugin(...)` in source for a case or spelling mismatch (see package.json Metadata above).

**A dist bundle you rebuilt or edited in place doesn't reflect your change.** Reinstalling the SAME plugin from Settings (Add Exporter/CodeView, even with the same name) always copies fresh bytes and triggers a real reload -- nothing to work around there. But if you edited the file Settings already copied into Application Support directly (bypassing the Settings UI entirely, e.g. via Finder/terminal while iterating), nothing watches it for changes; quit and relaunch, or reinstall through Settings instead.

## Testing

Every plugin's test files live inside its own directory and run via `npm test` (vitest) -- no Xcode involved. `npm install` at the repo root (see `developing-markupeditorapp`'s Setup section) installs and hoists dependencies for every plugin at once, including the shared `markupeditor` package -- run it once from the root, not per-plugin. `plugins/README.md` documents the full tiered pattern (converter unit tests, full-pipeline test, optional real-document fidelity test) established by the DocX exporter.

If your plugin imports anything from a DIFFERENT workspace member directly (not just `markupeditor` itself) -- e.g. the DocX exporter's fidelity test imports `markupeditor-app/src/markdown.js` -- that only resolves to a single, consistent module instance because both sides are hoisted to the one shared root `node_modules/` by the workspace. A plugin with its own separate `node_modules` (outside this workspace) would load two different copies of anything it shares with another member, which breaks in exactly the way you'd expect for stateful modules (double-registration errors, mismatched class identity).

Any test that constructs a real `EditorView` needs `jsdom` -- the real bundle's module-load-time CSS side effects use CSSOM APIs a lighter DOM implementation won't have. Also require Node 24 LTS (`^24.15.0`; root `.nvmrc`/`engines`, mirrored in your plugin's `engines.node`) -- older Node versions produce spurious test failures in this workspace.

```js
test: { environment: 'jsdom', setupFiles: './test/vitest.setup.js' },
```

Copy `test-setup-shim.js` in this skill's directory to `test/vitest.setup.js` verbatim as a starting point -- it patches the specific jsdom gaps (`CSSStyleSheet.replaceSync`/`.media`, `document.adoptedStyleSheets`, `document.execCommand`) every plugin that's needed this so far has hit.

Test the built `dist/*.js`, not `src/`, for the full-pipeline test -- `dist/*.js` is the only artifact a real plugin install executes, and a bundler-introduced bug won't show up testing `src/` directly. The built bundle imports `MU` from a relative `./markup-editor.js` that doesn't exist in the repo, so alias that literal specifier in `vitest.config.js` (`resolve.alias`, keyed by the specifier text as written, not an absolute path) to a stub exporting `getHTML`/`registerPlugin`/`activeView`; see `plugins/README.md`'s Testing section. Rebuild `dist/` via vitest's `globalSetup`, not an npm `pretest` script: `pretest` only fires for `npm test`, while a direct or scoped `vitest` invocation (single-file run, watch mode, editor integrations) skips it silently and tests a stale `dist/`. The fidelity tier stays on `src/`: it needs to mock a standalone internal module (e.g. `resolveImages.js`) that `dist/` inlines away entirely, so there's nothing left to intercept once the bundle is built. It still needs the `markupeditor`-to-real-bundle alias `plugins/README.md`'s Testing section documents -- that's an unrelated, always-applicable fix, not a dist-vs-src concern.

```js
// test/globalSetup.js
import { execFileSync } from 'node:child_process'
import path from 'node:path'

export default function setup() {
    execFileSync('npx', ['rollup', '-c'], { cwd: path.resolve(import.meta.dirname, '..'), stdio: 'inherit' })
}
```

Reference it from `vitest.config.js`'s `test.globalSetup`, alongside `setupFiles`.

## Comment Discipline

Comments should be terse and technical: state the non-obvious "why," not the "what" (identifiers already say that) and not how you got there.

| Habit | Fix |
|---|---|
| "X's own Y" as filler | Write "X's Y", or name the identifier directly -- same meaning, less noise. |
| Re-deriving the same reasoning in two nearby spots (a property and every call site, a config file and the script it configures) | Explain it once, in the more foundational location; point to it from the other (`-- see <file>/<symbol>`). |
| Narrating how the code came to be (a debugging session, "we found", "this used to work differently") | Describe the current implementation and why it's shaped that way, not its history -- a future reader cares about the code in front of them, not how it got there. |
| Padding a comment with detail the reader doesn't need for THIS line (a sibling module's full internals, a prior implementation) | Keep it to what's needed here; cross-reference by name if more detail lives elsewhere. |

## Publishing

After merging a plugin PR:

```bash
node plugins/generate-plugins-json.mjs
git add plugins/plugins.json
git commit -m "Update plugins.json"
```

The generator validates every `plugins/<dir>/package.json` against the rules above and fails loudly, naming the offending directory, rather than writing a partial or malformed manifest.
