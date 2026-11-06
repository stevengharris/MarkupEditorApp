# MarkupEditor Plugins

This document describes what a MarkupEditor plugin is and how to create one. The document is intended for developers and references the foundational libraries the MarkupEditor is built on.

A plugin is a JavaScript module that the MarkupEditor loads when it opens. Every plugin has a string `name` and `type`. The `type` can either be “exporter” or “codeview”:

* An **Exporter** can be invoked from the File->Export menu and let you transform the document into a form other than Markdown.
  * Note: The editor supports HTML and PDF export at installation. While these options show up in the File->Export menu for a more consistent user experience, they are not themselves packaged or loaded as exporter plugins.
* A **CodeView** displays the contents of a code block based on the language in that code block.

## Plugin API

Besides its name and type properties, an exporter exposes a run method that can be invoked from Swift using `MU.runPlugin(name).` A codeview has no run method and registers from `install()` instead.

A plugin's `name` and `type` are defined in its [`package.json`](#packagejson-metadata) through `plugin-kit`, the workspace package every plugin builds and tests with:

```js
import pkg from '../package.json' with { type: 'json' }
import { registerExporter } from 'markupeditor-plugin-kit/register'

registerExporter(pkg.markupeditor, { run })   // exporters register at module load
// registerCodeView(pkg.markupeditor)         // codeviews register from install()
```

`plugin-kit/` is a private workspace package (never published to npm; its source is in this repo). It is imported by subpath: `register`, `rollup`, `testing`, `testing/contract`, `testing/stub`, `metadata`, `images`, `export`, `base64`, `diagrams`, and `manifest`. Each plugin's `rollup.config.mjs` and `vitest.config.js` are a single call into it (`pluginConfig`, `pluginVitestConfig`). See `skills/writing-markupeditor-plugins` for scaffolding a plugin.

## Reference Plugins

The DocX and EPUB Exporters and the Mermaid diagram CodeView are provided as fully supported examples yplou can use to model your own plugins on.

> [DocX Exporter](https://github.com/stevengharris/MarkupEditorApp/tree/main/plugins/exporter-docx)

> [EPUB Exporter](https://github.com/stevengharris/MarkupEditorApp/tree/main/plugins/exporter-epub)

> [Mermaid Diagrams](https://github.com/stevengharris/MarkupEditorApp/tree/main/plugins/codeview-mermaid)

## Testing

A plugin's test suite lives entirely inside its own directory and runs via `npm test` (vitest) — no Xcode, no changes to MarkupEditorApp. `exporter-docx` establishes the pattern in three tiers; only the third reaches outside the plugin's directory.

**1. Converter unit tests.** Hand-crafted HTML snippets fed directly into your own HTML-to-format conversion function, decoded with your own format's decode helper, asserted structurally. No mocking needed. See `exporter-docx/test/htmlToDocx.test.js`.

**2. Full-pipeline test.** Import the real built `dist/*.js`, not `src/`, so the test exercises the artifact the app actually loads. The bundle imports `MU` from a relative `./markup-editor.js` (rollup's `paths` rewrite of the `markupeditor` specifier) that doesn't exist in the repo, so the tests alias that literal specifier to a stub exporting `MU.getHTML`/`registerPlugin`/`activeView`, and rebuild `dist/` first so a stale bundle is never tested. plugin-kit's `pluginVitestConfig({ dist: true })` (`markupeditor-plugin-kit/testing`) sets up both; a plugin's `vitest.config.js` is just that call. Set the stub's members before importing the dist:

```js
import { MU } from 'markupeditor-plugin-kit/testing/stub'
MU.getHTML = vi.fn(() => '<p>hello</p>')
MU.registerPlugin = vi.fn()
const { myExporter } = await import('../dist/my-exporter.js')
```

Call your plugin's exported `run()`, decode the result, assert. See `exporter-docx/test/docxexporter.test.js` and `exporter-docx/vitest.config.js`.

**3. Real-document fidelity test (optional).** Drives `run()` from HTML produced by the real markdown-import pipeline (`markupeditor-app`'s `importMarkdown`) instead of a hand-authored snippet, so the test proves your exporter matches what the real app actually produces. See `exporter-docx/test/test-exporter-fidelity.test.js` and its `test/helpers/renderTestDocument.js` harness.

For tier 3:

* Alias the `markupeditor` specifier (`pluginVitestConfig({ shippedBundle: true })` does this) to `MarkupEditor/Resources/markup-editor.js` — the exact bundle the real app loads at runtime — rather than letting it resolve to whichever package's `node_modules/markupeditor` copy happens to be installed nearby, which can drift out of sync with what's actually shipped. The alias applies across the whole module graph, so your `import { MU } from 'markupeditor'` and `markupeditor-app/src/markdown.js`'s `import { MU } from "markupeditor"` resolve to the SAME module instance — stubbing `MU.activeView()` (so `importMarkdown` can run without a live editor view) actually takes effect on the copy `importMarkdown` reads from. See `exporter-docx/vitest.config.js`.

* Don't `vi.mock('markupeditor', ...)` in a test file that also uses this alias-backed `MU` — Vitest mocks by resolved path, so a mock would replace the module for the whole graph reachable from that test file, including `markdown.js`'s import, losing `MU.schema`. If your plugin's `run()` also needs `MU` (e.g. `MU.getHTML()`), monkey-patch that property directly on the same real `MU` object instead — see `exporter-docx/test/test-exporter-fidelity.test.js`.

* Loading the real `markupeditor` bundle needs a real DOM (`jsdom`) plus small shims for gaps in `jsdom`'s CSSOM and DOM support (`CSSStyleSheet.replaceSync`, `CSSStyleSheet.media`, `document.execCommand`, `document.adoptedStyleSheets`). `pluginVitestConfig` installs them from `plugin-kit/src/testing/jsdomShims.js`.

* Real image loading (`Image`/`canvas`) hangs indefinitely in this environment — mock `resolveImages` (or your format's equivalent) wholesale rather than trying to make it work; image-loading fidelity itself is out of scope for this kind of test and is verified manually.

**Registration contract (every plugin).** A `test/registration-contract.test.js` calls `registrationContract` from `markupeditor-plugin-kit/testing/contract` against the built dist and `package.json`. It checks the banner matches `package.json`, and that the dist holds exactly one `MU.registerPlugin(` call site (none for an internal plugin), which is the kit's, and no leaked `author`/`description` text. For an exporter it also loads the dist against the stub and checks the one registration carries the same `name`, `type` and `ext` and a `run` function. A codeview registers only from `install()` against a live editor view, so its registered values are not loaded. See `exporter-docx/test/registration-contract.test.js`.

## package.json Metadata

Every plugin's `package.json` must include a `markupeditor` object. It is the single source of the plugin's identity: the build stamps it into the built file (see The Banner below) and the register functions read it, so nothing else states it.

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

Fields:

* `name` — the plugin's display name, and the exact string the app uses to look the plugin up. It must not contain `*/`.

* `type` — `"exporter"` or `"codeview"`.

* `ext` — required for `type: "exporter"` only, omitted for `"codeview"`. The file extension the exporter produces, bare with no leading dot (`"docx"`, not `".docx"`). It must not contain `*/`.

* `internal` — optional, `true` for a codeview that ships inside the app and is never user-installed or registered (`codeview-metadata`, `codeview-htmlfrontmatter`). The plugins.json generator skips it.

An exporter's `markupeditor` object also needs `ext`:

```json
"markupeditor": {
  "name": "DocX",
  "type": "exporter",
  "ext": "docx"
}
```

The top-level `package.json` fields `main`, `description`, `author`, and `version` are also required as plain strings.

The directory the plugin lives in under `plugins/` must equal `package.json`'s top-level `name` field. A mismatch fails the generator described below.

## The Banner

The build (`pluginConfig`) writes the identity as the first line of every built plugin, and imports of `package.json` are trimmed to just this block so the rest of the manifest never lands in the bundle:

```js
/*! markupeditor-plugin {"name":"DocX","type":"exporter","ext":"docx"} */
```

When a user adds a plugin in Settings, the app reads this line without executing the file. The user picks only the file; the name and extension are read from the banner and confirmed in an alert. A file with no banner is rejected. Do not edit it by hand: change `package.json` and rebuild. Each plugin's `registration-contract.test.js` fails when banner, `package.json` and registration disagree.

## Building

A plugin's built file in `dist/` is what the app installs and what the catalog serves, so it is committed. Install dependencies once from the repository root, then build a plugin from its own directory:

```bash
npm install                      # once, from the repository root
cd plugins/codeview-mermaid
npm run build                    # writes dist/codeview-mermaid.js
```

`build-npm.sh` in the repository root builds `markupeditor-app` and every plugin, and skips any project whose output is newer than its inputs. Run `FORCE=1 ./build-npm.sh` to rebuild them all.

## Versions

A plugin's `version` in `package.json` is the version the catalog shows. The app compares it with the version it recorded when the plugin was installed from the catalog, and offers Update when the catalog's is newer. The version is not part of the built file, whose banner holds only the name, type and extension, so changing only the version does not change `dist/`.

To release new versions:

1. Edit `version` in each `package.json`.
2. Run `npm install` from the repository root, which brings the workspace versions in `package-lock.json` up to date.
3. Rebuild with `npm run build` where a plugin's source changed.
4. Run `npm test --workspaces` from the repository root, which runs every project's tests.
5. Regenerate `plugins/plugins.json` as described below.
6. Commit the `package.json` files, `package-lock.json`, `plugins/plugins.json`, and any changed `dist/` files together.

## Publishing plugins.json

After merging a plugin PR, the maintainer regenerates the discovery manifest and commits it:

```bash
node plugins/generate-plugins-json.mjs
git add plugins/plugins.json
git commit -m "Update plugins.json"
```

The generator reads every `plugins/<dir>/package.json`, validates each one against the rules above, and writes `plugins/plugins.json`. It fails loudly — refusing to write anything — if any plugin's metadata is missing or malformed, naming the offending directory.

## Using AI and Skills

Here is an example of a prompt used with Claude Code to produce a working EPUB document exporter: [epub-example-prompt.md](https://github.com/stevengharris/MarkupEditorApp/blob/main/skills/writing-exporter-plugins/epub-example-prompt.md). It tells Claude to read this repository's skills first and to use the DocX exporter as its structural reference. The [writing-exporter-plugins](https://github.com/stevengharris/MarkupEditorApp/tree/main/skills/writing-exporter-plugins) skill explains how to adapt it for another format.
