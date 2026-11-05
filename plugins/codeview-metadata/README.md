# Metadata Front Matter

An internal codeview plugin that shows a document's YAML front matter as a collapsible table, with the underlying text available as **Source**.

It ships inside the app's Resources and is marked `internal` in `package.json`, so it is not listed in the plugin catalog and users never install or remove it. The front matter appears in the editor as a code block with the language `metadata`, which is only valid as the first block in the document. The table is a read-only view of that same text: edit in Source. Parsing is shared with the rest of the app through `markupeditor-plugin-kit/metadata`.

See the [plugin developer documentation](../README.md) for the plugin contract, `package.json` metadata, building, and testing.
