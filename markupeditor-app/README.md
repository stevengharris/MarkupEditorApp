# markupeditor-app

The markupeditor-app project produces a rolled-up `markupeditor-app.js` that is provided as a `userScript` to the MarkupEditorView that is created in the MarkupDocumentView of the MarkupEditorApp project.

## Scope

The MarkupEditorApp’s core WYSIWYG editing capabilities are provided by markupeditor-base, with the Swift MarkupEditor wrappings used as-needed. Under the covers, the editing is accomplished using a `contentEditable` div in a Swift WKWebView subclass. ProseMirror handles the DOM manipulation and complex operations within it in an efficient manner. The functionality that this project addresses centers primarily around how Markdown is integrated with the “native” HTML editing capabilities of markupeditor-base and the Swift MarkupEditor. Specifically...

* **HTML-Markdown round-tripping**. Import of Markdown into HTML, export of HTML into Markdown.

* **Custom MarkupDelegate**. To support MacOS-native insert dialogs, the project provides a custom delegate and registers it to receive callbacks. The delegate name is then passed to the MarkupEditorView when it is created in the MarkupDocumentView.

* **ID Injection**. When Markdown includes internal links (e.g., `[Scope](#scope)`), HTML headers get an `id` assigned to them so that links work while editing and can be exported.

* **Selection tracking**. When toggling between the document view and Markdown source, the selection is reset to an *approximate* block-level location.

## Use

When you build from Xcode or use its MarkupEditorApp target, it has a Build Phase that invokes `npm run build` and produces `dist/markupeditor-app.js`. The build’s rollup process uses the locally installed markupeditor.js file, so will always reference the version of markupeditor-base that the Swift MarkupEditor package dependency uses. The `dist/markupeditor-app.js` file is member of the MarkupEditorApp target and will be installed as a resource of the app.

## References

1. The Developer’s Guide and API for markupeditor-base are the principal documentation sources for the dependencies used in this project.

2. The project also uses ProseMirror API’s directly, along with markdown-it and prosemirror-markdown.

3. The Swift MarkupEditor README.md is the principal documentation for the Swift MarkupEditor. It describes how the userScript is used.