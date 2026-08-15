# MarkupEditor App

A native MacOS Markdown viewer and WYSIWYG editor.

## Demo

\< a tbd video >

## Features

* Native MacOS app, open source from top to bottom.

* True “what you see is what you get” Markdown editing.

* Shortcuts let you use your Markdown muscle memory naturally.

* Edit and view the WYSIWYG document or the underlying Markdown source.

* GitHub flavored Markdown support, including metadata and HTML in front matter.

* Customizable editing hotkeys.

* Customizable toolbar can be toggled on/off or fully hidden.

* Open from the command line using the `markup <filename>` command.

* Use and develop JavaScript-based *plugins* that extend functionality MarkupEditor functionality.

* Pre-installed open source plugins to to support DOCX export and Mermaid diagrams.

* Discover hosted plugins and contribute to a community of MarkupEditor users.

## Installation

Download the latest `MarkupEditor-<version>.pkg` and run it. This installs MarkupEditor.app in `/Applications` and makes the `markup` command available in Terminal.

`markup <filename>` opens a file in MarkupEditor, the same as double-clicking it in Finder. `markup` is installed as a symlink into the app bundle, so removing the app leaves the command pointing at nothing until you reinstall.

There's no dedicated uninstaller. To remove manually: delete `/usr/local/bin/markup` and drag MarkupEditor.app to the Trash.

## Contributions

Fixing a bug or building a plugin? If you're using [Claude Code](https://claude.com/product/claude-code), install this repo's own skills first -- they cover the three-repo architecture and the plugin-authoring conventions so you're not starting from scratch:

```bash
npx skills add stevengharris/MarkupEditorApp --skill developing-markupeditorapp
```

Building a plugin? Also install the plugin-specific skills:

```bash
npx skills add stevengharris/MarkupEditorApp --skill writing-markupeditor-plugins
npx skills add stevengharris/MarkupEditorApp --skill writing-codeview-plugins
```

(`writing-markupeditor-plugins` covers the contract shared by every plugin type; `writing-codeview-plugins` is specific to codeview plugins like the bundled Mermaid diagram support. Building an exporter instead? See `plugins/README.md` and use `plugins/markupeditor-exporter-docx` as your reference implementation -- a dedicated skill for that doesn't exist yet.)

Once installed, just describe what you're trying to do -- Claude Code loads the relevant skill automatically. Send a pull request when you're done; bug fixes and new plugins are both welcome.

## Support

Download from the App Store to support ongoing development and prioritize support issues.

The MarkupEditor depends on the amazing ProseMirror as a foundational part of WYSIWYG editing. A portion of App Store revenue from the MarkupEditor will go to support ProseMirror. If you find the MarkupEditor to be useful and are not using the App Store version, please support ProseMirror directly.

---

\* Coming soon