# Change Log

## MarkupEditor v0.9.11 (20261106)

This is the Beta 2 release.

Various editing- and presentation-related bug fixes, along with AI-assistant-related enhancements.

* Editing a document no longer rewrites parts you didn't change: source is preserved in unedited areas, so diffs stay small.
* You must acknowledge the privacy implications of AI assistance before enabling it.
* Suggestions: an assistant connected through MCP can propose edits instead of changing the document directly. Each suggestion shows the text that would change next to the replacement, with Accept and Reject buttons.
  * Accept or reject the selected suggestion with Return or Shift+Return and move on to the next.
  * The Edit > Suggestions menu adds Next, Previous, Accept All and Reject All.
  * Suggestion-related shortcuts are configurable in Keymap settings.
  * App warns before New, Open, Quit or switching to the source view would discard suggestions, and they survive an editor reload.
* Front matter values keep the quoting they had when read.
* Lists are written tight unless an item holds more than one block.
* Unnecessary escaping in Markdown for lone tildes and brackets is removed.
* Internal links do a better job at using GitHub-style, and links with non-ASCII targets work.
* The Table and Source buttons on the metadata block appear only while it is selected.
* Editing links was buggy but is now fixed.
* Saving a document with local images asks for folder access.
* Save panel adds the file extension automatically.
* Mermaid and HTML front matter plugins updated. Install the new versions from the Plugins tab.
* Dependency updates, including fixes for audit findings.

## MarkupEditor v0.9.10 (20261027)

A new Welcome flow replaces the Tour, and Mermaid and DocX move out of the app into separately installed plugins.

* A new Welcome flow replaces the Tour, and lets you choose plugins to install.
* Plugins are installed from a Plugins tab in the side panel. Mermaid and DocX are now separate downloads instead of being built in.
* Mermaid diagrams use Mermaid 12 and match what the Mermaid CLI and GitHub render.
* Mermaid diagrams are exported as images in DocX and EPUB files, and print correctly to PDF.
* PDF export paginates properly, and table cells wrap to fit the page width.
* Undo and Redo work in the source view, and text loaded into it can't be undone away.
* A new setting controls the width of the centered text column.
* More tools for working with document content through MCP, and a configurable connection limit.

## MarkupEditor v0.9.9 (20261016)

* Type a code fence with a language, like ```` ```bash ````, then press Return to start a code block in that language.
* Code in the block you're editing is no longer syntax-highlighted until you move out, which fixes characters dropped by inline predictions.
* The document text sits in a centered, readable column.
* Typing no longer produces curly quotes or em dashes.
* New tables start with a header row and size to their content.
* New hotkeys for images and horizontal rules, and a Horizontal Rule menu item.
* Preliminary MCP support.

## MarkupEditor v0.9.8 (20261005)

This build fixes an expired Evaluation opening a document from Finder: only the upgrade window opens now. If you installed the earlier 0.9.8 build (20260930), install this one over it.

## MarkupEditor v0.9.8 (20260930)

* Subscribers can connect their account in Settings > General. Connected Unlimited copies check for and install updates in the app.
* When the evaluation period ends, an upgrade window offers the Unlimited version.
* The menu bar shows the app as "MarkupEditor".
* The plugin catalog now loads from this repository.

## MarkupEditor v0.9.6 (2026-09-23)

First public Evaluation release.
