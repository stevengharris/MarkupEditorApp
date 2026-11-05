# markupeditor-app

The markupeditor-app project produces a rolled-up `markupeditor-app.js` that is provided as a `userScript` to the MarkupEditorView that is created in the MarkupDocumentView of the MarkupEditorApp project.

## Scope

The MarkupEditorApp’s core WYSIWYG editing capabilities are provided by markupeditor-base, with the Swift MarkupEditor wrappings used as-needed. Under the covers, the editing is accomplished using a `contentEditable` div in a Swift WKWebView subclass. ProseMirror handles the DOM manipulation and complex operations within it in an efficient manner. The functionality that this project addresses centers primarily around how Markdown is integrated with the “native” HTML editing capabilities of markupeditor-base and the Swift MarkupEditor, and around exposing the live document to the Swift app and AI assistants. Specifically...

* **HTML-Markdown round-tripping**. Import of Markdown into HTML, export of HTML into Markdown. Import parses with markdown-it, including GFM tables and strikethrough. YAML front matter is split off as metadata, and a run of HTML blocks at the start of the document becomes a single fenced code block.

* **Preserving unedited source**. When a document is opened or saved, `rebaseSource` records a source map of its blocks. `exportMarkdown({ preserve: true, tag })` then writes each block that is unchanged since that recording with its original lines, and serializes only the blocks that changed. Saving does not reformat parts of the document that were not edited. A block that cannot be preserved is written from the editor, and a stale tag exports everything from the editor.

* **Custom MarkupDelegate**. To support macOS-native insert dialogs, the project provides a custom delegate and registers it to receive callbacks. The delegate name is then passed to the MarkupEditorView when it is created in the MarkupDocumentView.

* **ID injection**. When Markdown includes internal links (e.g., `[Scope](#scope)`), HTML headers get an `id` assigned to them so that links work while editing and can be exported.

* **Selection tracking**. When toggling between the document view and Markdown source, the selection is reset to an *approximate* block-level location.

* **Block-level content tools**. `getBlocks` returns the document as top-level blocks, each with its Markdown and a hash of it. `replaceBlocks` replaces, inserts, or deletes blocks only if the caller’s hashes still match, as one undo step, and applies an image policy to what it inserts. `selectText` finds text and selects it. `proposeEdits` shows edits as suggestions for the user to accept or reject, and the suggestion commands accept, reject, and navigate them. The Swift side exposes these to AI assistants.

* **Markdown tables**. `insertTable` is wrapped so a table inserted into a Markdown document starts with a header row, which Markdown requires.

## Use

When you build from Xcode or use its MarkupEditorApp target, it has a Build Phase that invokes `npm run build` and produces `dist/markupeditor-app.js`. The build’s rollup process uses the locally installed markupeditor.js file, so will always reference the version of markupeditor-base that the Swift MarkupEditor package dependency uses. The `dist/markupeditor-app.js` file is a member of the MarkupEditorApp target, so it is copied into the app as a resource.

`src/app.js` is the entry point. It registers the delegate and attaches the functions above to `MU`, where the Swift code calls them.

## Testing

Run `npm test` from this directory, or `npm test --workspaces --if-present` from the repository root to run every JavaScript project. The tests use vitest in jsdom, and `pretest` builds first. Tests import the `markupeditor` bundle from `MarkupEditor/Resources/markup-editor.js` in the Swift MarkupEditor package, which must be checked out next to this repository, so the tests run against the bundle the app loads.

## References

1. The Developer’s Guide and API for markupeditor-base are the principal documentation sources for the dependencies used in this project.

2. The project also uses ProseMirror API’s directly, along with markdown-it and prosemirror-markdown.
