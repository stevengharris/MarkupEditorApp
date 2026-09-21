---
name: writing-markupeditor-plugins
description: Use when building any MarkupEditor plugin, or when unsure whether you need an exporter or a codeview plugin -- covers scaffolding a plugin on plugin-kit, the package.json identity block, registration, the dist banner, testing infrastructure, and which type-specific skill to read next.
---

# Writing MarkupEditor Plugins

**REQUIRED BACKGROUND:** `developing-markupeditorapp` -- read that first if you haven't already; it covers the three-repo architecture this skill assumes.

## Overview

A plugin is a JavaScript module, its own npm package under `plugins/<name>/`, that MarkupEditor loads when a document opens. Every plugin has a `name` and a `type`:

- **`exporter`** -- adds a File → Export transform to another file format. Reference implementations: `plugins/exporter-docx`, `plugins/exporter-epub`.
- **`codeview`** -- changes how a fenced code block of a specific language renders inside the live document. Reference implementations: `plugins/codeview-mermaid`, `plugins/codeview-geojson`, and the internal `plugins/codeview-htmlfrontmatter` and `plugins/codeview-metadata` (bundled and auto-loaded, not user-installable; see `writing-codeview-plugins`).

The editor loads plugins by `import()`ing each file listed in its `plugins` attribute (`MU.loadPlugins`), well after markupeditor-base's editor already exists, so a plugin never gets to set up the editor itself.

**`plugin-kit/`** (npm name `markupeditor-plugin-kit`, a workspace member that is never published to npm) holds everything plugins share: registration, the build config, the test config and helpers, frontmatter parsing, image resolution and the export envelope. Every plugin in `plugins/` builds and tests through it. Import it by subpath (there is no barrel export):

| Subpath | Provides |
|---|---|
| `markupeditor-plugin-kit/register` | `registerExporter`, `registerCodeView`, `registerPlugin` |
| `markupeditor-plugin-kit/rollup` | `pluginConfig` -- the whole `rollup.config.mjs` |
| `markupeditor-plugin-kit/testing` | `pluginVitestConfig` -- the whole `vitest.config.js` |
| `markupeditor-plugin-kit/testing/contract` | `registrationContract` -- the per-plugin contract test |
| `markupeditor-plugin-kit/testing/stub` | the stub `MU` that a built dist imports under test |
| `markupeditor-plugin-kit/metadata` | `extractMetadata`, `stripMetadataBlock`, `parseFrontmatter`, `metadataScalar`, `parseMetadataList` |
| `markupeditor-plugin-kit/images` | `resolveImages` and the WKWebView image-loading helpers |
| `markupeditor-plugin-kit/export` | `successEnvelope`, `failureEnvelope` (the exporter result shape) |
| `markupeditor-plugin-kit/base64` | `bytesToBase64`, `base64ToBytes` (chunked, safe for document-sized buffers) |
| `markupeditor-plugin-kit/manifest` | `pluginBanner`, `parsePluginBanner`, `validateMarkupEditorBlock` |

## Which Type Do You Need?

- Rendering a fenced code block as something else (a diagram, live HTML, syntax highlighting) → **REQUIRED SUB-SKILL:** `writing-codeview-plugins`.
- Transforming the document into another file format for export → **REQUIRED SUB-SKILL:** `writing-exporter-plugins`.

## Creating a Plugin

A plugin directory holds four small files of configuration next to its `src/` and `test/`. Nothing in them is copied from another plugin, and none of them types the plugin's name or type.

**`package.json`** -- the only place the plugin's identity is written (details below):

```json
{
  "name": "exporter-yourformat",
  "version": "0.1.0",
  "description": "MarkupEditor exporter plugin for YourFormat.",
  "type": "module",
  "main": "dist/exporter-yourformat.js",
  "license": "MIT",
  "author": "Your Name <you@example.com>",
  "engines": { "node": "^24.15.0" },
  "markupeditor": { "name": "YourFormat", "type": "exporter", "ext": "yourformat" },
  "devDependencies": {
    "jsdom": "^30.1.0",
    "markupeditor": "^0.9.32",
    "markupeditor-plugin-kit": "*",
    "rollup": "^4.31.0",
    "vitest": "^3.2.4"
  },
  "scripts": { "build": "rollup -c", "test": "vitest run" }
}
```

The root `package.json`'s `plugins/*` workspace glob already covers a new directory; run `npm install` once from the repo root to link it.

**`rollup.config.mjs`**:

```js
import { pluginConfig } from 'markupeditor-plugin-kit/rollup'

export default pluginConfig(import.meta.dirname, { input: 'src/yourplugin.js' })
```

`pluginConfig` reads `package.json`, writes the bundle to `main`, marks `markupeditor` (and, for a codeview, the ProseMirror packages) external so the plugin shares the editor's copy at runtime, resolves the plugin's imports, and stamps the banner. Pass `plugins: [...]` to append extra rollup plugins.

**`vitest.config.js`**:

```js
import { pluginVitestConfig } from 'markupeditor-plugin-kit/testing'

export default pluginVitestConfig({ dist: true })
```

**Source** -- register from the identity in `package.json`, never a hand-typed string:

```js
import pkg from '../package.json' with { type: 'json' }
import { registerExporter } from 'markupeditor-plugin-kit/register'

registerExporter(pkg.markupeditor, { run })          // exporter: registers at module load
// registerCodeView(pkg.markupeditor)                // codeview: call from install()
```

`registerExporter`/`registerCodeView` validate the block, check that its `type` matches, and call `MU.registerPlugin` with `name`, `type` and (exporters) `ext` taken from it. They refuse to accept `name`, `type`, `ext` or `filename` as members. Any extra member must be a string or a function: the host reads registrations as a string map, and a single value of another type makes it discard every registration in the list. Never call `MU.registerPlugin` directly -- the contract test fails a dist that does.

**`test/registration-contract.test.js`** -- every plugin has this file, with a `jsdom` pragma:

```js
// @vitest-environment jsdom
import path from 'node:path'
import { registrationContract } from 'markupeditor-plugin-kit/testing/contract'

registrationContract(path.resolve(import.meta.dirname, '..'))
```

Then read the type-specific skill for the source itself, and add your own tests (see Testing).

## package.json Metadata

The `markupeditor` block is the single source of the plugin's identity:

- `name` -- display name; also the exact string the app looks the plugin up by. Must not contain `*/`.
- `type` -- `"exporter"` or `"codeview"`.
- `ext` -- exporters only: the produced file extension, bare, no leading dot (`"docx"`, not `".docx"`). Must not contain `*/`.
- `internal` -- optional, `true` for a codeview that ships inside the app and is never installed or registered by the user. An internal plugin never calls a register function, and the banner omits the flag. Its `name` must match the name the Swift side (`InternalCodeView`) uses.

The top-level `main`, `description`, `author` and `version` must also be plain strings, and the directory under `plugins/` must equal the top-level `name`. `plugins/generate-plugins-json.mjs` enforces all of this and fails loudly, naming the directory. Full field reference: `plugins/README.md`.

## The Banner

`pluginConfig` writes a first-line comment into every built dist:

```js
/*! markupeditor-plugin {"name":"YourFormat","type":"exporter","ext":"yourformat"} */
```

The app reads this line, without executing the file, when a user adds a plugin in Settings: the user picks only the file, and the name and extension come from the banner and are confirmed in an alert. A file with no banner is rejected. The app refuses a name that is protected or clashes with a built-in, a name already used by a different file or kind, and a filename already backing a different plugin; the plugin kind must also match the "+" button used. Never edit the banner by hand -- change `package.json` and rebuild. `registrationContract` fails when banner and `package.json` disagree.

## Debugging

**The Swift side reports `Plugin 'X' is not registered with the editor. Registered exporters: ...`.** The app ran the plugin by name and the editor has no plugin under that name. Compare the name in the message with `package.json`'s `markupeditor.name` and the banner of the file Settings installed (`head -1` on it in Application Support). Common causes: an installed file from before a rename, a dist built from an older `package.json`, or a dist that threw before registering (run the contract test). When plugins load, the app also logs a `Plugin registration:` warning for every mismatch between what was installed and what the editor registered.

**The Swift side reports `Plugin 'X' returned no result`.** The plugin is registered and ran, but its `run()` returned nothing usable -- look at `run()` itself (see `writing-exporter-plugins`).

**A dist bundle you rebuilt or edited in place doesn't reflect your change.** Reinstalling the SAME plugin from Settings (Add Exporter/CodeView, even with the same name) always copies fresh bytes and triggers a real reload. But if you edited the file Settings already copied into Application Support directly (bypassing the Settings UI, e.g. via Finder or terminal while iterating), nothing watches it for changes; quit and relaunch, or reinstall through Settings instead.

## Testing

Every plugin's tests live in its own directory and run via `npm test` (vitest) -- no Xcode involved. `npm install` at the repo root installs and hoists dependencies for every plugin at once, including the shared `markupeditor` package. Require Node 24 LTS (`^24.15.0`; root `.nvmrc`, mirrored in each plugin's `engines.node`) -- older versions produce spurious failures in this workspace.

`pluginVitestConfig` builds the whole config:

| Option | Effect |
|---|---|
| `environment: 'jsdom'` | Runs every test file under jsdom. Omit it for a node default and put `// @vitest-environment jsdom` on the files that need a DOM. Anything that constructs a real `EditorView` or loads the real bundle needs jsdom. |
| `dist: true` | Tests import the plugin's built dist. Rebuilds the dist before any test runs (a vitest `globalSetup`, so a scoped or watch-mode run never tests a stale dist -- an npm `pretest` script would) and aliases the dist's relative `./markup-editor.js` import to the stub `MU`. |
| `shippedBundle: true` | Aliases `markupeditor` to the bundle the app ships (`MarkupEditor/Resources/markup-editor.js` in the sibling checkout) instead of the npm copy. Skipped when that checkout is absent. |

The config also installs the jsdom shims (`CSSStyleSheet.replaceSync`/`.media`, `document.adoptedStyleSheets`, `document.execCommand`) as a setup file. There is nothing to copy into the plugin.

Test the built dist for the full-pipeline test -- it is the only artifact a real install executes, so a bundler-introduced bug won't show up testing `src/`. Set the stub's members before importing the dist:

```js
import { vi } from 'vitest'
import { MU } from 'markupeditor-plugin-kit/testing/stub'
MU.getHTML = vi.fn(() => '<p>hello</p>')
MU.registerPlugin = vi.fn()
const { yourExporter } = await import('../dist/exporter-yourformat.js')
```

Tests that need a standalone internal module mocked (for example the kit's `images` module) stay on `src/`: the dist inlines it, leaving nothing to intercept.

`registrationContract` (above) checks the built dist against `package.json`. Exporters: the dist is loaded against the stub and the one captured registration must match `name`, `type` and `ext`, with a `run` function. Codeviews register only from `install()` against a live editor view, so only the banner, the number of `MU.registerPlugin(` call sites (exactly one; none for an internal plugin) and the absence of leaked `author`/`description` text are checked.

The `markupeditor` npm dependency versus the shipped bundle is checked once for the whole workspace by `plugin-kit/test/markupeditor-sync.test.js`; plugins need no sync test. If it fails, run `npm update markupeditor` from `markupeditor-app/` and rerun every suite.

If your plugin imports from a DIFFERENT workspace member directly (not just `markupeditor`) -- e.g. the DocX fidelity test imports `markupeditor-app/src/markdown.js` -- that only resolves to a single module instance because both sides are hoisted to the one root `node_modules/`.

`plugins/README.md` documents the tiered pattern (converter unit tests, full-pipeline test, optional real-document fidelity test).

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

The generator validates every `plugins/<dir>/package.json` against the rules above and fails loudly, naming the offending directory, rather than writing a partial or malformed manifest. Internal plugins are skipped.
