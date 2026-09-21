# MarkupEditor Plugins

This document describes what a MarkupEditor plugin is and how to create one. The document is intended for developers and references the foundational libraries the MarkupEditor is built on.

A plugin is a JavaScript module that the MarkupEditor loads when it opens. Every plugin has a string `name` and `type`. The `type` can either be “exporter” or “codeview”:

* An **Exporter** can be invoked from the File->Export menu and let you transform the document into a form other than Markdown.

  * The editor supports HTML and PDF export at installation.

* A **CodeView** displays the contents of a code block based on the language in that code block.

  * The editor supports Mermaid diagrams at installation.

## Plugin API

Besides its name and type properties, a plugin exposes its run method that can be invoked from Swift using MU.runPlugin(name).

A plugin never types its name or type. Both come from its `package.json` (see below) through `plugin-kit`, the workspace package every plugin builds and tests with:

```js
import pkg from '../package.json' with { type: 'json' }
import { registerExporter } from 'markupeditor-plugin-kit/register'

registerExporter(pkg.markupeditor, { run })   // exporters register at module load
// registerCodeView(pkg.markupeditor)         // codeviews register from install()
```

`plugin-kit/` is a private workspace package (never published to npm; its source is in this repo). It is imported by subpath: `register`, `rollup`, `testing`, `testing/contract`, `testing/stub`, `metadata`, `images`, `export`, `base64` and `manifest`. Each plugin's `rollup.config.mjs` and `vitest.config.js` are a single call into it (`pluginConfig`, `pluginVitestConfig`). See `skills/writing-markupeditor-plugins` for scaffolding a plugin.

## Reference Plugins

The DocX and EPUB Exporters and the Mermaid diagram CodeView are provided as fully supported examples you can use to model your own plugins on.

DocX Exporter

EPUB Exporter

Mermaid Diagrams

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

## Publishing plugins.json

After merging a plugin PR, the maintainer regenerates the discovery manifest and commits it:

```bash
node plugins/generate-plugins-json.mjs
git add plugins/plugins.json
git commit -m "Update plugins.json"
```

The generator reads every `plugins/<dir>/package.json`, validates each one against the rules above, and writes `plugins/plugins.json`. It fails loudly — refusing to write anything — if any plugin's metadata is missing or malformed, naming the offending directory.

## Using AI and Skills

Here is an example of a prompt used with Claude Code to produce a working EPUB document exporter:

```
Build a real, working EPUB exporter plugin for MarkupEditorApp.

Before writing any code, read these skills in order and follow them:
1. skills/developing-markupeditorapp (three-repo architecture, setup)
2. skills/writing-markupeditor-plugins (shared plugin contract, package.json metadata, testing infra)
3. skills/writing-exporter-plugins (exporter-specific contract, the {result,warnings,metadata}
   envelope, and a worked-example walkthrough of EPUB's package structure)

Also read plugins/exporter-docx in full (src/, test/, package.json and its two config files) as
your structural reference implementation, and plugins/README.md's Testing and package.json
Metadata sections.

Task: create plugins/exporter-epub, a new exporter plugin that converts the live MarkupEditor
document to a valid EPUB3 file.

Requirements:
- Same plugin shape as exporter-docx: a package.json with a `markupeditor` object
  (name: "EPUB", type: "exporter", ext: "epub") as the only place the plugin's identity is
  written, src/, test/, dist/ (built via plugin-kit's pluginConfig), and an npm dependency on a
  pure-JS zip library (no Node API dependency -- this runs inside a WKWebView JS context).
  Register with plugin-kit's registerExporter(pkg.markupeditor, { run }); don't hand-type the
  name or call MU.registerPlugin.
- Produces a spec-valid EPUB3 package: mimetype (first entry, stored uncompressed),
  META-INF/container.xml, an OPF package document (metadata with dc:identifier/dc:title/
  dc:language/dcterms:modified, manifest, spine), an EPUB3 nav document, and one or more
  well-formed XHTML content documents converted from MU.getHTML()'s output.
- Images referenced in the document become real files inside the zip (correct relative href
  and media-type in both the XHTML and the OPF manifest), not inline data: URIs. You'll need
  the same Image/<canvas> local-image-loading workaround plugin-kit's resolveImages
  (markupeditor-plugin-kit/images) uses (WKWebView blocks fetch() of file:// images) -- reuse it
  rather than reinventing it, but decode the result back to raw bytes for a zip entry instead of handing
  it to a DOCX-style embed.
- run() returns the same JSON-stringified {result, warnings, metadata} envelope exporter-docx
  uses (result is base64, chunked to avoid call-stack overflow on encode). Non-fatal problems
  (unrecognized tag, image that couldn't embed) go in warnings; only a genuine failure returns
  result: null.
- Cover every tag markupeditor-base's schema can produce (schema/index.js in
  markupeditor-base is the authority) in your HTML-to-XHTML conversion; warn on anything
  unrecognized rather than dropping it silently.
- Tests: follow the three-tier pattern from plugins/README.md -- converter unit tests, a
  full-pipeline test against plugin-kit's stub MU so run() executes standalone, and if
  practical a real-document fidelity test (pluginVitestConfig's shippedBundle option). Add the
  registration contract test. If epubcheck (the standard external EPUB validator) is available
  on this machine, use it manually to sanity-check output; don't wire it into the automated
  suite or block on installing it if it isn't already present.
- After the plugin works and its tests pass, regenerate the discovery manifest per
  plugins/README.md's Publishing section (node plugins/generate-plugins-json.mjs).

Work incrementally and show me the plugin working (a real document round-tripped through it,
tests passing) before proposing a commit.
```