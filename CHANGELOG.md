# Change Log

## MarkupEditor v0.9.12 (20261116)

* Templates.
  * File > New from Template… starts a document from a template, and File > Save as Template… makes a template from the open document, including the images it uses.
  * A Templates tab in the side panel lists the templates. Add one from a Markdown file or a folder, rename it, edit it, or delete it.
  * Built-in templates are provided, including a README, a Ghost blog post, and a Claude skill. A built-in you have changed shows a Restore… button to put the shipped version back.
  * A template that breaks the rules (one Markdown file, images beside it or in one folder) is refused with a message that says which rule.
  * The Templates tab works with VoiceOver.
* A Shortcuts tab in Settings replaces the Keymap tab, organized like the menu bar.
  * Click a shortcut and press the new keys to record it.
  * Undo, Redo, Find and Source have shortcuts you can change. Search is now called Find throughout.
  * Suggestion shortcuts appear on the Document tab.
* A raw HTML block in Markdown that holds several images now warns that only the first was kept. HTML front matter with centered badges round-trips unchanged.
* File > Show in Finder reveals the open document.
* Menu icons for Undo, Redo, Suggestions, Zoom In, Zoom Out and Export.
* `markup export` can use installed exporter plugins: for example `--format docx` or `--format epub`.
* Opening a second copy of MarkupEditor quits it and brings the running copy forward, so two copies no longer share preferences.
* A document whose file is deleted stays open as untitled.
* The About window shows links to the Privacy Policy and Terms of Use, and a Release Notes button. For an Evaluation version, it shows the expiration date.
* The Log tab shows more of what happens: update checks, sign-in, assistant access, plugin and template problems, and failed conversions. Entries have a time and a level, repeats and the messages of one operation are grouped, and you can filter and sort the log and copy all of it or the rows you select. A marker on the sidebar button shows an unread warning or error.
* Lower idle energy use when AI assistants are enabled.

## MarkupEditor v0.9.11 (20261107)

This is the Beta 2 release.

* Editing a document no longer rewrites parts you didn't change: source is preserved in unedited areas, so diffs stay small.
* You must acknowledge the privacy implications of AI assistance before enabling it.
* Suggestions: an assistant connected through MCP can propose edits instead of changing the document directly. Each suggestion shows the text that would change next to the replacement, with Accept and Reject buttons.
  * Accept or reject the selected suggestion with Return or Shift+Return and move on to the next.
  * The Edit > Suggestions menu adds Next, Previous, Accept All and Reject All.
  * Suggestion-related shortcuts are configurable in Shortcuts settings.
  * App warns before New, Open, Quit or switching to the source view would discard suggestions, and they survive an editor reload.
* Front matter values keep the quoting they had when read.
* Lists are written tight unless an item holds more than one block.
* Unnecessary escaping in Markdown for lone tildes and brackets is removed.
* Internal links do a better job at using GitHub-style, and links with non-ASCII targets work.
* The Table and Source buttons on the metadata block appear only while it is selected.
* Editing links was buggy but is now fixed.
* Saving a document with local images asks for folder access.
* Save panel adds the file extension automatically.
* New `markup export` command converts a Markdown file to HTML or PDF from the command line.
  * HTML export writes tight lists and leaves local images as relative links by default. An "Embed local images" checkbox in the save panel (and `--images embed` on the command line) inlines them instead.
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
