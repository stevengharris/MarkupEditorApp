<p align="center">
    <img alt="The MarkupEditor logo" src="https://markupeditor.app/content/images/2026/09/markupeditor-icon-navy-1-2.svg" width="96px" height="96px" >
</p>

<p align="center">
    <img src="https://github.com/stevengharris/MarkupEditorApp/actions/workflows/swift.yml/badge.svg">
    <img src="https://img.shields.io/badge/Swift-6.0+-blue.svg">
    <img src="https://img.shields.io/badge/macOS-26+-blue" alt="macOS 26+">
    <a href="https://mastodon.social/@stevengharris">
        <img src="https://img.shields.io/badge/Contact-@stevengharris-lightgrey.svg?style=flat" alt="Mastodon: @stevengharris">
    </a>
</p>

# MarkupEditor

A native macOS Markdown viewer and WYSIWYG editor.

Markdown was designed as a plain text formatting syntax that is as readable as possible while being easily converted to HTML. You still need a tool to render the HTML, often leading to an edit-preview cycle that seems ridiculous when we've had WYSIWYG editors for 40 years. The MarkupEditor presents the HTML as you write, providing immediate feedback while letting you continue to use the Markdown muscle memory you already have. It is customizable and extensible. Built-in extensions let you export to different formats and view/edit diagrams and Markdown front-matter right in your document.

## Demo

<img src="https://github.com/user-attachments/assets/ec3f9340-1007-48ce-a9e6-3369e6ba0e63" alt="MarkupEditor Demo" width="1280" height="1116">

## Features

* Native macOS app, open source from top to bottom.

* True "what you see is what you get" Markdown editing.

* Shortcuts let you use your Markdown muscle memory naturally.

* Edit and view the WYSIWYG document or the underlying Markdown source.

* GitHub flavored Markdown support, including metadata and HTML in front matter.

* Customizable editing hotkeys.

* Customizable toolbar can be toggled on/off or fully hidden.

* Open from the command line using the `markup <filename>` command.

* Extend MarkupEditor functionality using JavaScript-based *plugins*.

* Export to PDF and DocX out-of-the-box. Add exporters using plugins.

* View Mermaid diagrams and GeoJSON out-of-the-box. Add plugins for additional capabilities.

* Discover hosted plugins and contribute to a community of MarkupEditor users.

## Installation Options

You have three installation options. You also might qualify for a complimentary subscription providing free access to the Unlimited Version.

### Evaluation Version Package

Download the latest [release](https://github.com/stevengharris/MarkupEditorApp/releases) of `MarkupEditor-Eval-<version>.pkg` and run it. This package installs `MarkupEditor.app` in your `Applications` directory along with the `markup` command line utility. The installed app triggers a two-week evaluation time limit from the time you open it. The Evaluation Version makes it easy to try out the MarkupEditor. If you like it and want to avoid the time limitation, you need to either build it yourself from source or subscribe to get access to the Unlimited Version.

### Unlimited Version Package

To support ongoing MarkupEditor app development and to gain access to the pre-built non-time-limited package, go to [https://markupeditor.app](https://markupeditor.app/) and subscribe for $12/year. Once you have subscribed, you will have access to the [downloads page](https://markupeditor.app/downloads) for the Unlimited Version. The Unlimited Version has no license key and does not check if your subscription is valid, so you can use it for as long as it works without renewing your subscription.

### Open Source Build/Install

Developers can clone this repository, open the MarkupEditorApp project in Xcode, and build the `MarkupEditorApp` target. Building the project requires node/npm to be installed.

#### Command Line

The `markup` command line utility is a separate target in Xcode, `MarkupEditorCLI`, producing a standalone tool rather than an app bundle. If you want the command line utility, you might want to build it directly at the command line, from the repository root:

```bash
xcodebuild -scheme MarkupEditorCLI -configuration Release -derivedDataPath ./build build
```

Then put the resulting binary on your PATH by adding a symlink, for example:

```bash
sudo ln -sf "$(pwd)/build/Build/Products/Release/markup" /usr/local/bin/markup
```

Note that both the Evaluation Version and Unlimited Version packages install the command line tool and symlink as part of the installation process, because the command line tool is part of the package.

#### Xcode Schemes

As a developer, probably only the `MarkupEditorApp` and `MarkupEditorCLI` schemes will be of use. `MarkupEditorApp-Unlimited` and `MarkupEditorApp-Eval` build the same `MarkupEditorApp` target under different configurations and are only used as part of the package publishing process.

### Complimentary Subscription

If you fall in any of the following categories, you qualify for a complimentary subscription that provides access to the Unlimited Version:

* You live in a country fighting an aggressive, oligarchic regime threatening its sovereignty. For example: you live in Canada or Ukraine.

* You are a committer on a FOSS project.

* You are a committer on any of the projects the MarkupEditorApp depends on.

* You can't afford the subscription right now.

First, set up an account on <https://markupeditor.app> so I can identify you. Then, send an email to [freepass@markupeditor.app](mailto:freepass@markupeditor.app) with a link and/or very brief intro, and I will set up the complimentary subscription giving you access to the Unlimited Version.

## Command Line Utility

Installation of the Evaluation or Unlimited version package also installs a command line utility. From the command line:

> `markup <filename>`

opens `<filename>` in the MarkupEditor, the same as double-clicking it in Finder. `markup` is installed as a symlink into the app bundle, so removing the app leaves the command pointing at nothing until you reinstall. To remove manually: delete `/usr/local/bin/markup`.

## Plugins

Plugins extend the functionality of the MarkupEditor. The editor comes with pre-installed plugins to support DocX exporting and to let you edit and display Mermaid diagrams and GeoJSON on OpenStreetMap-based maps. You can add and remove plugins from Settings within the app. The catalog of public plugins on the web site is synced with the app. You can create your own plugins and install them locally, and you can contribute a public plugin using a pull request.

Consult the [README.md](https://github.com/stevengharris/MarkupEditorApp/tree/main/plugins) in the plugins directory for information about creating plugins for your own use and contributing them to the community.

## Contributing

Project structure, the use of AI in this project's development, and contribution guidelines have moved to [CONTRIBUTING.md](CONTRIBUTING.md).

## Privacy

The MarkupEditor does not require network access to run at any time. You own your documents locally, and the app doesn't track anything about you. You can build it, use it, and extend it yourself.

The app uses the network only for things you ask it to do: images you insert by URL, map tiles for GeoJSON maps, the plugin catalog when you open it and plugins you install from it, and, if you connect your markupeditor.app account in Settings, confirming your subscription and checking for and downloading updates. Account requests and update checks go only to markupeditor.app. The site redirects update downloads to its file storage (storage.ghost.io), which receives no account information. Account and update requests stop when you disconnect.

When you subscribe to get access to the Unlimited Version, you need to identify yourself with an email address. See the [Privacy Policy](https://markupeditor.app/privacy) and [Terms of Use](https://markupeditor.app/terms) on the [web site](https://markupeditor.app).

## License

The MarkupEditorApp is available under the [MIT License](https://github.com/stevengharris/MarkupEditorApp/blob/main/LICENSE).

The source licensing covers the *code*, not the MarkupEditor *name or logo*. "MarkupEditor" and the MarkupEditor logo are trademarks/copyrighted material of Steven G. Harris. You may not use the MarkupEditor name or logo without permission. In short, do not represent the MarkupEditor as your own work or associate the MarkupEditor name or logo with a work derived from it.

## Acknowledgements

The MarkupEditor depends on the amazing [ProseMirror](https://prosemirror.net) as a foundational part of WYSIWYG editing. A portion of the MarkupEditor app subscription revenue, once and if it exceeds expenses to host it, will go to support ProseMirror. If you find the MarkupEditor to be useful and/or are not using the supported version, please [support ProseMirror directly.](https://marijnhaverbeke.nl/fund/)