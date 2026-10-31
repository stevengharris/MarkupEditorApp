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

## Features

* Native macOS app, open source from top to bottom.

* True "what you see is what you get" Markdown editing.

* Shortcuts let you use your Markdown muscle memory naturally.

* Edit and view the WYSIWYG document or the underlying Markdown source.

* GitHub flavored Markdown support, including metadata and HTML in front matter.

* Customizable editing hotkeys.

* Customizable toolbar can be toggled on/off or fully hidden.

* Open from the command line using the `markup <filename>` command.

* Opt-in support for a MarkupEditor MCP server, so you can collaborate with the AI assistant of your choice while editing a document.

* Extend MarkupEditor functionality using JavaScript-based *plugins*.

* Export to HTML and PDF out-of-the-box. Install exporters for DocX and EPUB from the plugin catalog, or add your own.

* View Mermaid diagrams and GeoJSON by installing their plugins from the catalog. Add plugins for additional capabilities.

* Discover hosted plugins and contribute to a community of MarkupEditor users.

## Demo

A five minute demonstration of what it's like to edit using the MarkupEditor.

![Editing Demo](https://github.com/user-attachments/assets/4bd1139a-efc7-4b4c-a234-b6c0b85767d8)

And a quick look at collaborative editing with an AI assistant using the MCP server.

![AI Assistant Demo](https://github.com/user-attachments/assets/23aaa0d6-7422-41d3-91c7-e75957cb924d)

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

Refer to the README in the MarkupEditorCLI for more information, including details on the MCP server that is bundled with it. The commands/config to register the MCP server with Claude Code and other AI assistants are available within the MarkupEditor app itself, in Settings.

## Plugins

Plugins extend the functionality of the MarkupEditor. HTML and PDF export are built in. Plugins from the catalog support DocX and EPUB exporting and let you edit and display Mermaid diagrams and GeoJSON on OpenStreetMap-based maps. You can install, update, add from a file, and uninstall plugins in the Plugins tab of the app's right side panel. The catalog of public plugins on the web site is synced with the app. You can create your own plugins and install them locally, and you can contribute a public plugin using a pull request.

Consult the [README.md](https://github.com/stevengharris/MarkupEditorApp/tree/main/plugins) in the plugins directory for information about creating plugins for your own use and contributing them to the community.

## Contributing

Refer to the separate [CONTRIBUTING.md](CONTRIBUTING.md) file for more information.

## Privacy

You own your documents locally, and the app does not track anything about you. You can build the MarkupEditor from source, use it, and extend it yourself. The Evaluation and Unlimited versions provided from [this repository](https://github.com/stevengharris/MarkupEditorApp/releases) and from <https://markupeditor.app/downloads> are built from exactly the same source provided here.

The MarkupEditor itself does not require network access to run at any time. However, documents you edit or load into the MarkupEditor may connect to the network as they serve remote images. Plugins, like the GeoJSON plugin, may also connect to other sites - for example, to serve map tiles.

The plugin catalog presented in the MarkupEditor app is hosted as part of this repository. Accessing the catalog to browse and install plugins requires the app to connect to GitHub. They may track this activity, but the MarkupEditor does not.

The MarkupEditor CLI includes an MCP server that allows an AI assistant to connect to the running MarkupEditor app. *AI-assisted editing is an opt-in feature*. When you opt-in in Settings, MarkupEditor requires you to acknowledge the privacy implications, since the AI assistant you use may expose the document you are editing to a remote service. If you opt-in, you will be subject to the privacy policy of the AI assistant when you connect it to the MarkupEditor. The MarkupEditor will prompt you to approve the connection when your AI assistant tries to connect.

When you subscribe to get access to the Unlimited Version, you need to identify yourself with an email address. Account activity to check your subscription status and download app updates interacts with the [MarkupEditor web site](https://markupeditor.app). The site redirects update downloads to its file storage (storage.ghost.io), which receives no account information. Account and update requests stop when you disconnect.

See the [Privacy Policy](https://markupeditor.app/privacy) and [Terms of Use](https://markupeditor.app/terms) on the [web site](https://markupeditor.app).

## License

The MarkupEditor is available under the [MIT License](https://github.com/stevengharris/MarkupEditorApp/blob/main/LICENSE).

The source licensing covers the *code*, not the MarkupEditor *name or logo*. "MarkupEditor" and the MarkupEditor logo are trademarks/copyrighted material of Steven G. Harris. You may not use the MarkupEditor name or logo without permission. In short, do not represent the MarkupEditor as your own work or associate the MarkupEditor name or logo with a work derived from it.

## Acknowledgements

The MarkupEditor depends on the amazing [ProseMirror](https://prosemirror.net) as a foundational part of WYSIWYG editing. A portion of the MarkupEditor app subscription revenue, once and if it exceeds expenses to host it, will go to support ProseMirror. If you find the MarkupEditor to be useful and/or are not using the supported version, please [support ProseMirror directly.](https://marijnhaverbeke.nl/fund/)
