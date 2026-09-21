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
