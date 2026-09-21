# markupeditor-mermaid

A renderer that can be added to the MarkupEditorApp renderers list to support Mermaid diagrams.

The renderer is distributed with the MarkupEditorApp as part of the Resources, so is effectively pre-installed.

## Development

The plugin's name and type come from the `markupeditor` block in `package.json`; `npm run build` writes `dist/codeview-mermaid.js` with that identity as its first line, and `npm test` rebuilds it and runs the suite, including the registration contract. See `skills/writing-markupeditor-plugins`.
