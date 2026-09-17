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

## Quick Reference

Non-obvious mechanisms, verified empirically against `exporter-docx`:

| Topic | One-line summary |
|---|---|
| Base64 encoding | `btoa`/`String.fromCharCode` over a real document-sized buffer overflows the call-stack argument limit -- chunk in `0x8000`-byte pieces, both encoding and decoding. |
| Embedding local images | WKWebView's `fetch()`/`XMLHttpRequest` of a `file://` image resolves `{ok: false, status: 0}` even though a plain `<img>` displays it fine -- load via a real `Image`/`<canvas>` element instead (`resolveImages.js`'s pattern), not a network call. |
| Remote images | Set `image.crossOrigin = 'anonymous'` for `http(s)://` sources so `canvas.toDataURL()` can read the pixels without a tainted-canvas `SecurityError`. |
| Canvas re-encoding | `canvas.toDataURL()` always rasterizes to PNG, never the source format -- fine for DOCX (embeds arbitrary raster), but means you cannot preserve an original JPEG/GIF this way. |
| HTML traversal | Parse with `DOMParser`, dispatch on `element.tagName` against a table covering every tag markupeditor-base's schema can produce (`schema/index.js` in markupeditor-base is the authority) -- warn on an unrecognized tag rather than silently dropping it. |
| Format-default mismatches | If your format has implicit defaults (DOCX's library default page size is A4) that your own layout math assumes differently (Letter), set both explicitly and keep them in one place -- a silent mismatch only shows up as wrong output, never an error. |
| Testing | Three tiers, only the third reaching outside the plugin's own directory: (1) converter unit tests -- hand-crafted HTML fed to your own conversion function, decoded with your own format's decode helper; (2) full-pipeline test -- `vi.mock('markupeditor', ...)` so `run()` runs standalone; (3) optional real-document fidelity test -- alias `markupeditor` to `MarkupEditor/Resources/markup-editor.js` (the real shipped bundle) so the test drives `run()` from the real `importMarkdown` pipeline's HTML. See `plugins/README.md`'s Testing section for the alias/mocking gotchas. |

## Worked Example: EPUB

No `exporter-epub` plugin exists yet, but EPUB is a useful worked example because its constraints differ from DOCX's in ways that generalize:

**Package structure.** An EPUB is a zip file, not a single XML document like a `.docx`'s primary content part. You need a pure-JS zip library (`fflate` is a reasonable choice -- small, no Node API dependency, matching the browser-only JS environment every exporter runs in). Required members:

- `mimetype` -- must be the *first* entry in the zip, stored uncompressed (`STORE`, not `DEFLATE`), with no extra field. Most zip libraries need an explicit per-file compression-level override to get this right; getting it wrong produces a file some readers silently refuse.
- `META-INF/container.xml` -- points to the package document.
- `OEBPS/content.opf` -- the package document: `<metadata>` (EPUB3 requires `dc:identifier`, `dc:title`, `dc:language`, and a `dcterms:modified` date), `<manifest>` (every file in the package, with `id`/`href`/`media-type`), `<spine>` (reading order by manifest `id`).
- `OEBPS/nav.xhtml` -- the EPUB3 navigation document (required); a `toc.ncx` alongside it is optional EPUB2-reader backward compatibility.
- One or more XHTML content documents (the actual chapters/sections).

**XHTML strictness.** Unlike DOCX's HTML-to-object-model conversion, EPUB content documents are XML, not HTML -- they must be well-formed: void elements self-close (`<br/>`, `<img/>`), `&` is always entity-escaped, attributes are always quoted. A converter that emits loose HTML (as browsers tolerate) will produce an EPUB that fails validation even if it happens to render in one particular reader. `epubcheck` is the standard external validator; treat it as a manual/CI check outside the vitest suite, the same way DocX's fidelity test treats real image loading as out of scope and mocks it instead.

**Images.** DOCX embeds image bytes directly into a run (`ImageRun`); EPUB instead wants each image as its own real file in the zip, referenced by a relative `href` from both the XHTML and the OPF manifest (with the correct `media-type`) -- not a `data:` URI left inline. You still need `resolveImages`'s `Image`/`<canvas>` loading trick to get local images out of WKWebView at all (same `fetch()` restriction applies regardless of target format), but the last step differs: decode the resulting `data:` URI back to raw bytes and add it as a zip entry, rather than handing docx a data URI to embed.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Returning raw bytes or a plain object instead of the `{result, warnings, metadata}` JSON-stringified envelope | Always return `JSON.stringify({ result, warnings, metadata })`, `result` as base64 or `null` |
| Throwing instead of catching and reporting via the envelope | Catch, push a message to `warnings`, return `{result: null, warnings, metadata: null}` -- a thrown exception surfaces as an opaque "plugin returned no result" to the user |
| Loading local images via `fetch()`/`XMLHttpRequest` | Use a real `Image`/`<canvas>` element (see Quick Reference) |
| Encoding a full document's bytes to base64 in one `String.fromCharCode(...spread)` call | Chunk at `0x8000` bytes |
| Assuming your format library's defaults match your own hardcoded layout/structure assumptions | Set both explicitly, in one place, and note the dependency in a comment |
| Testing only the mocked full-pipeline tier | Add a converter-unit tier for structural assertions and, when feasible, a real-document fidelity tier -- each catches different classes of bug |
