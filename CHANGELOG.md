# Change Log

## Version 0.9.10 (20261027)

A new Welcome flow replaces the Tour, and Mermaid and DocX move out of the app into separately installed plugins.

* A new Welcome flow replaces the Tour, and lets you choose plugins to install.
* Plugins are installed from a Plugins tab in the side panel. Mermaid and DocX are now separate downloads instead of being built in.
* Mermaid diagrams use Mermaid 12 and match what the Mermaid CLI and GitHub render.
* Mermaid diagrams are exported as images in DocX and EPUB files, and print correctly to PDF.
* PDF export paginates properly, and table cells wrap to fit the page width.
* Undo and Redo work in the source view, and text loaded into it can't be undone away.
* A new setting controls the width of the centered text column.
* More tools for working with document content through MCP, and a configurable connection limit.

## Version 0.9.9 (20261016)

* Type a code fence with a language, like ```` ```bash ````, then press Return to start a code block in that language.
* Code in the block you're editing is no longer syntax-highlighted until you move out, which fixes characters dropped by inline predictions.
* The document text sits in a centered, readable column.
* Typing no longer produces curly quotes or em dashes.
* New tables start with a header row and size to their content.
* New hotkeys for images and horizontal rules, and a Horizontal Rule menu item.
* Preliminary MCP support.

## Version 0.9.8 (20261005)

This build fixes an expired Evaluation opening a document from Finder: only the upgrade window opens now. If you installed the earlier 0.9.8 build (20260930), install this one over it.

## Version 0.9.8 (20260930)

* Subscribers can connect their account in Settings > General. Connected Unlimited copies check for and install updates in the app.
* When the evaluation period ends, an upgrade window offers the Unlimited version.
* The menu bar shows the app as "MarkupEditor".
* The plugin catalog now loads from this repository.

## Version 0.9.6 (2026-09-23)

First public Evaluation release.
