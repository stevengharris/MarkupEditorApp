# MarkupEditor CLI

This project contains the Command Line Interface for the MarkupEditor.

## Features

* Open a Markdown file for editing using the MarkupEditor.

* Start the MarkupEditor MCP server.

## Installation

The CLI is installed with any MarkupEditor package, both the Evaluation and Unlimited versions.

If you are building from source, you can use the MarkupEditorCLI target from within Xcode, or you can build from the command line and then :

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