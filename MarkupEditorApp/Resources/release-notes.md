This is the Beta 2 release.

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
* New `markup export` command converts a Markdown file to HTML or PDF from the command line.
  * HTML export writes tight lists and leaves local images as relative links by default. An "Embed local images" checkbox in the save panel (and `--images embed` on the command line) inlines them instead.
* Mermaid and HTML front matter plugins updated. Install the new versions from the Plugins tab.
* Dependency updates, including fixes for audit findings.
