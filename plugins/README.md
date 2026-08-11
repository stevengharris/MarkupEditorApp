# MarkupEditor Plugins

This document describes what a MarkupEditor plugin is and how to create one. The document is intended for developers and references the foundational libraries the MarkupEditor is built on. 

A plugin is a JavaScript module that the MarkupEditor loads when it opens. Every plugin has a string `name` and `type`. The `type` can either be “exporter” or “codeview”:

* An **Exporter** can be invoked from the File->Export menu and let you transform the document into a form other than Markdown.

  * The editor supports HTML and PDF export at installation.

* A **CodeView** displays the contents of a code block based on the language in that code block.

  * The editor supports Mermaid diagrams at installation.

## Plugin API

Besides its name and type properties, a plugin exposes its run method that can be invoked from Swift using MU.runPlugin(name).

## Reference Plugins

The DocX Exporter and the Mermaid diagram CodeView are provided as fully supported examples you can use to model your own plugins on.

DocX Exporter

Mermaid Diagrams

## package.json Metadata

Every plugin's `package.json` must include a `markupeditor` object describing it for discovery:

```json
{
  "name": "markupeditor-codeview-mermaid",
  "main": "dist/markupeditor-codeview-mermaid.js",
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

* `name` — the plugin's display name. Must match the `name` passed to `MU.registerPlugin(...)` in the plugin's source exactly. That call is the runtime source of truth; `package.json` only mirrors it, and nothing checks the two stay in sync automatically, so keep them matching by hand.
* `type` — `"exporter"` or `"codeview"`. Must also match the `type` passed to `MU.registerPlugin(...)`.
* `ext` — required for `type: "exporter"` only, omitted for `"codeview"`. The file extension the exporter produces, bare with no leading dot (`"docx"`, not `".docx"`).

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

## Publishing plugins.json

After merging a plugin PR, the maintainer regenerates the discovery manifest and commits it:

```bash
node plugins/generate-plugins-json.js
git add plugins/plugins.json
git commit -m "Update plugins.json"
```

The generator reads every `plugins/<dir>/package.json`, validates each one against the rules above, and writes `plugins/plugins.json`. It fails loudly — refusing to write anything — if any plugin's metadata is missing or malformed, naming the offending directory.