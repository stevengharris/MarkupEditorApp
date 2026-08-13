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

\<tbd>

## Support

Download from the App Store to support ongoing development and prioritize support issues.

The MarkupEditor depends on the amazing ProseMirror as a foundational part of WYSIWYG editing. A portion of App Store revenue from the MarkupEditor will go to support ProseMirror. If you find the MarkupEditor to be useful and are not using the App Store version, please support ProseMirror directly.

---

\* Coming soon