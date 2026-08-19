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

## Installation Options

You have three installation options.

### Open Source Build/Install

Developers can clone this repository, open the MarkupEditorApp project, and use the `MarkupEditorApp` build target within Xcode. Building the project requires node/npm be installed.

### Pre-Built Time-Limited Eval Version

Download the latest `MarkupEditor-<version>.pkg` and run it. This installs MarkupEditor.app in `/Applications` and makes the `markup` command available in Terminal. The installed app enforces a two-week evaluation time limit. Clever developers will find a way around the two week time limit, but if you’re that clever, you should just build the application from source yourself. Or, just use the supported version.

### Supported Version

To support MarkupEditor app development and to gain access to the pre-built non-time-limited package, go to https://markupeditor.app and subscribe. Once you have subscribed, you will have access to the download page for the supported MarkupEditor app. The version you download has no license key and does not check if your subscription is valid, so you can use it for as long as it works without renewing your subscription. 

## Command Line Utility

Installation of the app also installs a command line utility. From the command line:

> `markup <filename>` 

opens a file in MarkupEditor, the same as double-clicking it in Finder. `markup` is installed as a symlink into the app bundle, so removing the app leaves the command pointing at nothing until you reinstall. To remove manually: delete `/usr/local/bin/markup.`

## Plugins

A plugin extends the functionality of the MarkupEditor. The editor comes with pre-installed plugins to support DocX exporting and to let you edit and display Mermaid diagrams and GeoJSON on OpenStreetMap-based maps. You can be add and remove plugins from Settings within the app. The same catalog of plugins shown within the app can also be viewed from the MarkupEditor app web site.

## Contributions

Contributions, including both bug fixes and plugins, are welcome. Clone this repository, run and extend tests, and submit a pull request.

### Quick Tour

The part of this repository related to the Swift app proper has, I believe, a fairly straightforward and easily understood structure. It is built using SwiftUI in Xcode with very few deviations into AppKit because of SwiftUI deficiencies. The UI and model/utility classes and structs are organized in their own directories as you might expect. The part that will seem unusual for many Swift developers is the mixture of Swift and JavaScript. This is in large part because the MarkupEditorApp is built on top of the MarkupEditor, a Swift package that wraps calls to an API exposed in the markupeditor-base JavaScript package. The markupeditor-base package in turn depends on ProseMirror to help with the WYSIWYG editing. Here, let’s use a Mermaid diagram to show how it fits together:

\<Insert Mermaid Diagram>

The plugins to support exporters and code views (e.g., Mermaid and GeoJSON) are also written in JavaScript, so these dependencies also have to be brought in to the MarkupEditorApp package. The document you are editing when using the app is, ultimately, a contentEditable div inside of a WKWebView, and all of the JavaScript is loaded as ES modules into that view.

Life would be simpler if the Swift Package Manager provided a way to express a dependency on a JavaScript package, but this is not the case. Every JavaScript dependency required in the chain produces a `dist` artifact using `npm build` and `rollup`. To ensure that what you build is up-to-date, the Xcode build process uses a script Build Phase to build the JavaScript dependencies and produce the `dist` artifact ES bundles that are loaded into the WKWebView at runtime. Mixing Swift and JavaScript is, admittedly, kind of complicated and drags you across a broad toolchain that you may not be familiar with. 

You don’t need to know anything about the JavaScript toolchain just to work in the Swift app proper. However, if you want to work in the WYSIWYG editing area, you will have to venture into the MarkupEditor and perhaps into markupeditor-base. If you want to work on a plugin, you will also be exposed to markupeditor-base and even ProseMirror. Fortunately, if you’re using AI, this can be very easy.

### Using AI

Fixing a bug or building a plugin? If you're using [Claude Code](https://claude.com/product/claude-code), install this repo's skills first -- they cover the three-repo architecture and the plugin-authoring conventions so you're not starting from scratch:

```bash
npx skills add stevengharris/MarkupEditorApp --skill developing-markupeditorapp
```

Building a plugin? Also install the plugin-specific skills:

```bash
npx skills add stevengharris/MarkupEditorApp --skill writing-markupeditor-plugins
npx skills add stevengharris/MarkupEditorApp --skill writing-codeview-plugins
```

The `writing-markupeditor-plugins` skill covers the contract shared by every plugin type. The `writing-codeview-plugins` skill is specific to codeview plugins, such as the bundled Mermaid diagram support. If you are building an exporter plugin, see the `plugins/README.md` and use `plugins/markupeditor-exporter-docx` as your reference implementation -- a dedicated skill for that doesn't exist yet.

Once installed, just describe what you're trying to do -- Claude Code loads the relevant skill automatically. Send a pull request when you're done.

## Acknowledgements

The MarkupEditor depends on the amazing ProseMirror as a foundational part of WYSIWYG editing. A portion of the MarkupEditor app subscription revenue will go to support ProseMirror. If you find the MarkupEditor to be useful and are not using the supported version, please support ProseMirror directly.