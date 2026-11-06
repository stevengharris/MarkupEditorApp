# Change Log

## Version 0.9.11 (20261106)

<!-- DRAFT: rewrite this section, then delete this line -->

* Release automation (#44)
* Fix the Eval test scheme issues in the MCP harness
* Update and fix all readmes across the project (#42)
* Ask for folder access when saving local images and let the save panel add the file extension
* Rename a local that shadowed the helper it calls in the front matter serializer
* Straighten curly quotes only in the body of a replace_blocks fragment, and warn about curly-quoted front matter values
* Stop escaping a lone tilde and brackets that cannot start a link, task box or footnote
* Write front matter values back with the quoting they had when read
* Warn when an unclosed HTML block at the start of a fragment becomes the HTML header
* Show the metadata block's Table and Source buttons only while it is selected or holds the caret
* Write lists tight unless an item holds more than one block
* Clear the document's front matter when the block the editor showed is gone, so undo and redo stay in step
* Run CI on pull requests only, skip it for docs, and cancel superseded runs
* Update MarkupEditor and markupeditor to 0.9.54 for the link editing fix
* Put images in their own directory
* Drop the redundant AppConfig cast in the plugin source tests
* Let the MCP tools take their editor from the test fixture, so another suite's editor cannot take it mid-test
* Use GitHub heading slugs from markupeditor-base for internal links, and decode non-ASCII link targets
* Release codeview-mermaid 1.0.3 and codeview-htmlfrontmatter 1.0.1 with DOMPurify 3.4.17
* Update dependencies: markupeditor 0.9.53, vitest 5, and patch releases for the audit findings
* Build with Xcode 26.6: replace the async Result initializer in a test
* README: AI assistance section
* Fit assistant instructions under Claude Code's limit; document the limit
* Warn before discarding suggestions on New, Open and Quit; keep them across editor reloads
* Configurable suggestion shortcuts, live menu update, Suggest tab in Keymap settings
* Accept or reject the selected suggestion and move on, with Return and Shift+Return and with chorded menu commands that also go back
* Make the unmodified replace_blocks result a constant
* Style the suggestion buttons with a red Reject, colored borders, centered text and no trailing edge
* Enable the Suggestions menu only with pending suggestions, warn before the source view discards them, and accept or reject with Return and Shift+Return
* Tell assistants what to say after proposing edits and how to refer to suggestions
* Wait for the server's reply in MCP loop tests instead of a fixed delay (#35)
* Minimize diffs when editing existing documents by preserving source in unedited areas (#34)
* Make sure users acknowledge and understand AI assistance privacy implications (#33)
* Suggestions: stale on a formatting change inside a range, synthesize missing editor results, deliver Cmd-Shift-' to Previous, settle on an input barrier, guard test indexing
* Suggestions: refuse a find that crosses formatting, per-edit refusals for malformed edits, fuller assistant contract, queue pins
* Suggestions: pin the whole-document span test and the C1 upper bound
* Suggestions: end-to-end scenario through the MCP tools
* Suggestions: Edit > Suggestions menu (next, previous, accept all, reject all)
* Suggestions: app control facade and headless web view tests
* Suggestions: reply decoders, web view bridge, assistant instructions
* Suggestions: propose_edits and list_suggestions tools, objectArray schema, dispatcher
* Suggestions: stale on a split inside a range, refuse nested code and control characters, caret-start navigation, accept-time recheck
* Suggestions: MU.proposeEdits and the rest of the MU surface
* Suggestions: decorations, widgets, export-time hiding
* Suggestions: accept, reject and navigate as one undo step
* Suggestions: plugin state, position mapping, stale handling
* Suggestions: pure planning of proposed edits (findInBlock, planProposals)

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
