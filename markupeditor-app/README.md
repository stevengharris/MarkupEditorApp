# markupeditor-markdown

A ProseMirror plugin for MarkupEditorApp that converts between ProseMirror document model and Markdown (CommonMark + GFM tables and strikethrough). It bundles `prosemirror-markdown` and `markdown-it` into a single IIFE at `dist/markupeditor-markdown.js`, which is loaded by the MarkupEditorApp plugin mechanism (RDR-014) and registers itself via `MU.registerPlugin(...)` at module scope. To build, run `npm run build` from this directory. To run the test suite, run `npm test` (this also builds first via the `pretest` hook).
