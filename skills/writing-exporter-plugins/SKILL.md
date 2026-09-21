---
name: writing-exporter-plugins
description: Use when building a MarkupEditor exporter plugin -- code that adds a File -> Export transform converting the document into another file format (DOCX, EPUB, etc.) instead of changing how the document is edited.
---

# Writing Exporter Plugins

**REQUIRED BACKGROUND:** `developing-markupeditorapp` and `writing-markupeditor-plugins` -- read both first. This skill assumes you already know the three-repo architecture and the general plugin contract; it covers only what's specific to exporters.

## Overview

An exporter plugin adds a File -> Export entry that converts the live document into a different file format's bytes -- the document itself is untouched, and nothing about how it's edited changes. One reference plugin exists: `plugins/exporter-docx` (HTML -> DOCX via the `docx` npm package). Read it before starting.

The load-bearing contract is the return shape of your plugin's `run()`, consumed by the Swift side (`MarkupConverter.runExporterDecoded` / `ImportExportValue.decodeExportOutput` in `MarkupEditorAppLib`):

```json
{ "result": "<base64 bytes, or null on failure>", "warnings": ["..."], "metadata": null }
```

`run()` must return this shape, JSON-stringified, regardless of which library produced the bytes -- the JS bridge only carries strings, so binary output always crosses as base64. Non-fatal problems (an image that couldn't embed, an unrecognized tag) go in `warnings` and the export still succeeds; only a thrown/caught failure should produce `result: null`.

## When to Use

- Building a new File -> Export transform to a format not already supported.
- Debugging why an exporter's output is missing content, mis-escaped, or the Swift side reports "plugin returned no result."
- Not for codeview plugins (changing how a fenced code block renders in the live editor) -- see `writing-codeview-plugins` instead.

## Core Pattern

```js
import { MU } from "markupeditor"

export class YourExporter {
    async run() {
        const warnings = []
        try {
            const html = await resolveYourAssets(MU.getHTML(), warnings) // images, etc.
            const bytes = await convertHtmlToYourFormat(html, warnings)
            return JSON.stringify({ result: toBase64(bytes), warnings, metadata: null })
        } catch (error) {
            warnings.push(`<Format> conversion failed: ${error.message}`)
            return JSON.stringify({ result: null, warnings, metadata: null })
        }
    }
}

export const yourExporter = new YourExporter()
MU.registerPlugin({ name: 'YourFormat', type: 'exporter', filename: 'exporter-yourformat.js', run: yourExporter.run.bind(yourExporter) }, 'YourFormat')
```

`ext` (the produced file extension, bare, no leading dot) is declared in `package.json`'s `markupeditor` object, not passed to `registerPlugin` -- see `plugins/README.md`.

## Document Metadata

The document's YAML frontmatter is data about the document, not part of it. It's held authoritatively on the Swift side (`MarkupDocument.metadata`) and, when non-empty, seeded into the live ProseMirror document as a `code_block` at position 0 with `attrs.language === 'metadata'` -- this is the only access a plugin has to it as structured data.

**Reading it.** Read the document model via `MU.activeView()`, not `MU.getHTML()` -- there's no metadata accessor on `MU` itself:

```js
function extractMetadata(MU) {
    const view = MU.activeView?.()
    const first = view?.state?.doc?.firstChild
    if (!first || first.type?.name !== 'code_block' || first.attrs?.language !== 'metadata') return {}
    return parseMetadataLines(first.textContent) // your own `key: value` line parser
}
```

Lowercase the parsed keys. Frontmatter field names are free-typed with no schema and no autocomplete anywhere in the app -- `Title:`/`CREATOR:` are exactly as likely as `title:`/`creator:`, and a case-sensitive lookup silently misses the differently-cased version.

**Do not include it in exported body content.** `MU.getHTML()` renders the metadata `code_block` exactly like any other `<pre><code class="language-X">`, inline with the rest of the document. Strip it before passing the HTML to your converter:

```js
function stripMetadataBlock(html) {
    return (html ?? '').replace(/^\s*<pre><code class="language-metadata">[\s\S]*?<\/code><\/pre>\s*/, '')
}
const rawHtml = stripMetadataBlock(MU.getHTML())
```

**Mapping fields to your format.** There's no fixed vocabulary -- pick names that match your target format's terms directly (e.g. docx's `creator`/`title`/`description`/`keywords`, matching its `IPropertiesOptions` exactly) rather than inventing a synonym layer to translate from. The app writes frontmatter in three value shapes, and your parser has to read all of them:

* Scalars, with quotes stripped and escapes undone (`"say \"hi\""`, `'it''s'`). The app quotes any value beginning with an indicator character (`-`, `#`, `&`, `*`, `!`, ...) or containing `: `, so `"#swift"` is common, and a naive `value.slice(1, -1)` misses the escapes.
* Flow sequences (`keywords: [foo, "a, b"]`), split on commas outside quotes. A plain `split(',')` breaks a quoted element that contains a comma.
* Block sequences (`keywords:` followed by indented `- item` lines).

Return sequences as arrays and scalars as strings, and join an array in a field you expect to be a scalar rather than passing it to your format's writer. `plugins/exporter-docx/src/metadata.js` is a working parser to copy from; its `parseMetadataList` and `metadataScalar` handle the array-versus-string split.

If your format has a fixed vocabulary of metadata fields (e.g. EPUB's Dublin Core elements), map non-reserved fields through an allowlist of that vocabulary rather than turning arbitrary frontmatter keys into elements or attributes, and warn on the rest -- schemas reject unknown names, and an unvalidated key would leak arbitrary frontmatter into the output. See the Worked Example below.

## Quick Reference

Non-obvious mechanisms, verified empirically against `exporter-docx`:

| Topic | One-line summary |
|---|---|
| Base64 encoding | `btoa`/`String.fromCharCode` over a real document-sized buffer overflows the call-stack argument limit -- chunk in `0x8000`-byte pieces, both encoding and decoding. |
| Embedding local images | WKWebView's `fetch()`/`XMLHttpRequest` of a `file://` image resolves `{ok: false, status: 0}` even though a plain `<img>` displays it fine -- load via a real `Image`/`<canvas>` element instead (`resolveImages.js`'s pattern), not a network call. |
| Remote images | Set `image.crossOrigin = 'anonymous'` for `http(s)://` sources so `canvas.toDataURL()` can read the pixels without a tainted-canvas `SecurityError`. |
| Canvas re-encoding | `canvas.toDataURL()` always rasterizes to PNG, never the source format -- fine for DOCX (embeds arbitrary raster), but means you cannot preserve an original JPEG/GIF this way. |
| HTML traversal | Parse with `DOMParser`, dispatch on `element.tagName` against a table covering every tag markupeditor-base's schema can produce (`schema/index.js` in markupeditor-base is the authority) -- warn on an unrecognized tag rather than silently dropping it. |
| Format-default mismatches | If your format has implicit defaults (DOCX's library default page size is A4) that your layout math assumes differently (Letter), set both explicitly and keep them in one place -- a silent mismatch only shows up as wrong output, never an error. |
| Testing | Three tiers, only the third reaching outside the plugin's directory: (1) converter unit tests -- hand-crafted HTML fed to your conversion function, decoded with your format's decode helper; (2) full-pipeline test -- import the built `dist/*.js`, with `vitest.config.js` aliasing its relative `./markup-editor.js` import to a stub `MU` (`test/helpers/markup-editor-stub.js`) so `run()` runs standalone, and `globalSetup` rebuilding `dist/` first; (3) optional real-document fidelity test -- alias `markupeditor` to `MarkupEditor/Resources/markup-editor.js` (the real shipped bundle) so the test drives `run()` from the real `importMarkdown` pipeline's HTML. See `plugins/README.md`'s Testing section for the alias/mocking gotchas. |

## Worked Example: EPUB

`plugins/exporter-epub` was produced by invoking this skill (and `writing-markupeditor-plugins`) from a clean clone with the prompt in `epub-example-prompt.md` (this directory) -- it's both a demonstration of what invoking this skill correctly looks like and, once merged, the second reference implementation alongside `exporter-docx`. Adapt that prompt's shape -- swap the target format, its package requirements, its format-specific pitfalls -- as a template for exercising this skill on a new exporter.

EPUB's constraints differ from DOCX's in ways worth calling out explicitly:

**Package structure.** An EPUB is a zip file, not a single XML document like a `.docx`'s primary content part. You need a pure-JS zip library (`fflate` is a reasonable choice -- small, no Node API dependency, matching the browser-only JS environment every exporter runs in). Required members:

- `mimetype` -- must be the *first* entry in the zip, stored uncompressed (`STORE`, not `DEFLATE`), with no extra field. Most zip libraries need an explicit per-file compression-level override to get this right -- fflate's `zipSync`, for one, deflates a bare `Uint8Array` entry by default; pass a `[bytes, { level: 0 }]` tuple instead to store it uncompressed. Getting this wrong produces a file some readers silently refuse.
- `META-INF/container.xml` -- points to the package document.
- `OEBPS/content.opf` -- the package document: `<metadata>` (EPUB3 requires `dc:identifier`, `dc:title`, `dc:language`, and a `dcterms:modified` date), `<manifest>` (every file in the package, with `id`/`href`/`media-type`), `<spine>` (reading order by manifest `id`).
- `OEBPS/nav.xhtml` -- the EPUB3 navigation document (required); a `toc.ncx` alongside it is optional EPUB2-reader backward compatibility.
- One or more XHTML content documents (the actual chapters/sections).

**XHTML strictness.** Unlike DOCX's HTML-to-object-model conversion, EPUB content documents are XML, not HTML -- they must be well-formed: void elements self-close (`<br/>`, `<img/>`), `&` is always entity-escaped, attributes are always quoted. A converter that emits loose HTML (as browsers tolerate) will produce an EPUB that fails validation even if it happens to render in one particular reader. `epubcheck` is the standard external validator; treat it as a manual/CI check outside the vitest suite, the same way DocX's fidelity test treats real image loading as out of scope and mocks it instead.

**Images.** DOCX embeds image bytes directly into a run (`ImageRun`); EPUB instead wants each image as a real file in the zip, referenced by a relative `href` from both the XHTML and the OPF manifest (with the correct `media-type`) -- not a `data:` URI left inline. You still need `resolveImages`'s `Image`/`<canvas>` loading trick to get local images out of WKWebView at all (same `fetch()` restriction applies regardless of target format), but the last step differs: decode the resulting `data:` URI back to raw bytes and add it as a zip entry, rather than handing docx a data URI to embed.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Returning raw bytes or a plain object instead of the `{result, warnings, metadata}` JSON-stringified envelope | Always return `JSON.stringify({ result, warnings, metadata })`, `result` as base64 or `null` |
| Throwing instead of catching and reporting via the envelope | Catch, push a message to `warnings`, return `{result: null, warnings, metadata: null}` -- a thrown exception surfaces as an opaque "plugin returned no result" to the user |
| Loading local images via `fetch()`/`XMLHttpRequest` | Use a real `Image`/`<canvas>` element (see Quick Reference) |
| Encoding a full document's bytes to base64 in one `String.fromCharCode(...spread)` call | Chunk at `0x8000` bytes |
| Assuming your format library's defaults match your hardcoded layout/structure assumptions | Set both explicitly, in one place, and note the dependency in a comment |
| Testing only the mocked full-pipeline tier | Add a converter-unit tier for structural assertions and, when feasible, a real-document fidelity tier -- each catches different classes of bug |
| Rebuilding `dist/` via an npm `pretest` script | Use vitest's `globalSetup` instead -- `pretest` only fires for `npm test`, not a direct/scoped `vitest` run |
| Assuming `test-exporter.md` must stay identical across exporters | It's a duplicated, not shared, fixture -- each exporter's copy is free to diverge (e.g. exporter-specific metadata). If you change yours and think another exporter's copy should follow, file an issue rather than deciding unilaterally. |
