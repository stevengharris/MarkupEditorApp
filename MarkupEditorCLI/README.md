# MarkupEditor CLI

This project contains the Command Line Interface for the MarkupEditor.

## Features

* Open a Markdown file for editing using the MarkupEditor.

* Convert a Markdown file to HTML or PDF.

* Start the MarkupEditor MCP server.

## Installation

The CLI is installed with any MarkupEditor package, both the Evaluation and Unlimited versions.

If you are building from source, you can use the MarkupEditorCLI target from within Xcode, or you can build from the command line, from the repository root:

```bash
xcodebuild -scheme MarkupEditorCLI -configuration Release -derivedDataPath ./build build
```

Then put the resulting binary on your PATH by adding a symlink, for example:

```bash
sudo ln -sf "$(pwd)/build/Build/Products/Release/markup" /usr/local/bin/markup
```

## Usage

### Editing/Viewing a Markdown File

Probably the most common use of the CLI is to open the MarkupEditor on a Markdown file:

```bash
markup <filename.md>
```

Note that if `filename.md` contains references to local images (generally in the same directory as `filename.md` or a subdirectory below it), you will be prompted to allow access to the directory containing `filename.md`. If you allow access, local images will load and display properly. If not, they may show up in document as broken image links.

### Exporting to HTML or PDF

Convert a Markdown file without opening the editor:

```bash
markup export --format html notes.md
markup export --format pdf --output notes.pdf notes.md
markup export --format html --output - notes.md
```

Without `--output`, the result is saved as a file beside the input, with a `.html` or `.pdf` extension (`notes.md` becomes `notes.html`). Use `--output <path>` to save it elsewhere, or `--output -` to write it to standard output instead. An existing output file is refused unless `--force` is given. The HTML is the document body, with front matter removed and list items written tight: an item with a single paragraph has no `<p>`, and the editor restores it when the HTML is opened. By default local images stay relative references (`--images link`), so the HTML must stay next to its images; `--images embed` inlines the images found in the input file's folder as data URIs, and a PDF always includes them. An image that is missing, is not an image, or lies outside the input file's folder is left as written, with a warning. The conversion runs in a windowless launch of the MarkupEditor app this CLI is part of, so the app does not have to be running. Use `--app <path>` to convert with a different copy of the app. Without it, the command refuses to run if the app's version differs from the CLI's, and it does not run once an Evaluation Version has expired.

### Running the MCP server

The CLI can run a [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets an assistant such as Claude read and edit the document open in MarkupEditor.

```bash
markup mcp
```

The server talks over stdin/stdout, so you normally don't run it by hand. Your assistant starts it and communicates with it directly. The MarkupEditor app must be running, because the server forwards requests to the app over its control socket. By default the socket is in the app's container. If yours is elsewhere, use `--socket`:

```bash
markup mcp --socket <path>
```

### Connecting to Claude Code

Register the server with Claude Code:

```bash
claude mcp add markupeditor -- markup mcp
```

By default this applies to the current project. Add `--scope user` to make it available in every project, or `--scope project` to record it in the project's `.mcp.json` so it is shared with your team:

```bash
claude mcp add --scope user markupeditor -- markup mcp
```

Then start (or restart) `claude`, and run `/mcp` to check that `markupeditor` is connected. Open a document with `markup <filename.md>` and ask Claude to work with it. If `markup` is not on the PATH that Claude Code sees, use the full path to the binary in the command above.

#### Claude Code's limit on MCP instructions

Claude Code sends the model only the first part of an MCP server's instructions and of each tool description: 4,096 characters by default in current versions, and fewer in older ones. The MarkupEditor server keeps its instructions and every tool description within 4,096 characters, with the rules that matter most first, so no configuration is needed.

If you use an older Claude Code with a lower limit and want the later detail too, set `CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH` in the `env` section of `~/.claude/settings.json`, or of a project's `.claude/settings.json`. The setting applies to every MCP server Claude Code uses and needs Claude Code 2.1.280 or later:

```json
{
  "env": {
    "CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH": "8192"
  }
}
```

Claude Code reads the instructions when the server connects, so reconnect with `/mcp` (or restart `claude`) after updating MarkupEditor.

### Connecting to Claude Desktop

Add the server to `claude_desktop_config.json` (Settings > Developer > Edit Config), then restart Claude Desktop:

```json
{
  "mcpServers": {
    "markupeditor": {
      "command": "/usr/local/bin/markup",
      "args": ["mcp"]
    }
  }
}
```

Claude Desktop does not use your shell's PATH, so give the full path to `markup`.

Claude edits go into the open document as a single undo step and leave it unsaved, so you can review them before saving.

### Other AI Assistants

Any assistant that can launch a local MCP server over stdio can use the MarkupEditor. Configure it to run this command:

```bash
/usr/local/bin/markup mcp
```

Most assistants take the same three pieces of information: a name (`markupeditor`), a command (the full path to `markup`), and arguments (`mcp`). Many read an `mcpServers` entry like the one shown for Claude Desktop. For example:

* **Cursor:** add the entry to `.cursor/mcp.json` in your project, or `~/.cursor/mcp.json` for all projects.

* **Gemini CLI:** add the entry to `~/.gemini/settings.json`.

* **Codex CLI:** register the server from the command line, or add it to `~/.codex/config.toml`:

```bash
codex mcp add markupeditor -- /usr/local/bin/markup mcp
```

* **VS Code (GitHub Copilot):** add the server to `.vscode/mcp.json`. VS Code uses a `servers` key rather than `mcpServers`:

```json
{
  "servers": {
    "markupeditor": {
      "type": "stdio",
      "command": "/usr/local/bin/markup",
      "args": ["mcp"]
    }
  }
}
```

Configuration details vary between assistants and change over time, so check your assistant's MCP documentation for where its configuration lives. As with Claude, the MarkupEditor app must be running and have a document open.

Please file an [issue](https://github.com/stevengharris/MarkupEditorApp/issues) if you find an error with these instructions.