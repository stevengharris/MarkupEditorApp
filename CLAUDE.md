# MarkupEditorApp

A macOS SwiftUI document editor built on the local `MarkupEditor` Swift package. The app allows creating, opening, editing, and saving HTML documents using a rich-text web-based editor.

## Project Structure

```
MarkupEditorApp/
  MarkupEditorApp.swift      - App entry point, MarkupEditor global config
  MarkupDocumentView.swift   - Main view, MarkupDelegate conformance, file I/O, plugin dispatch
  MarkupDocument.swift       - Document model (URL, metadata, save/open operations)
  AppDelegate.swift          - NSMenu construction, menu action notifications
  SourceView.swift           - Source view panel (raw HTML or plugin output)
  DocumentOpener.swift       - File open/save-as helpers, image asset operations
  PluginSetup.swift          - Plugin registration at app startup
  AppConfig.swift            - Codable config loaded from appconfig.json
```

The `MarkupEditor` package is a local Swift package at `../MarkupEditor` (sibling directory).

## Architecture

- **Entry point**: `MarkupEditorApp` (`@main`) wires up `AppDelegate` via `@NSApplicationDelegateAdaptor`
- **Menu system**: `AppDelegate` builds the full `NSMenu` once, deferred to the next run loop iteration in `didFinishLaunching`. SwiftUI strips the menu between `willFinishLaunching` and `didFinishLaunching`, so the build is deferred. If an early menu is ever needed again, cache the result of `buildMenu()` rather than calling it twice.
- **Menu → View communication**: Menu actions post `NotificationCenter` notifications (e.g. `.menuSaveDocument`). `MarkupDocumentView` listens with `.onReceive`. Do not use AppKit delegates or callbacks directly into the view.
- **Editor interaction**: All rich-text operations go through `MarkupEditor.selectedWebView` (a `MarkupWKWebView`). JavaScript commands use the `MU.*` namespace (e.g. `MU.insertTable()`).
- **Image selection**: Driven by `MarkupEditor.selectImage` (`@ObservedObject`) toggling a `fileImporter`.
- **Plugin dispatch**: `handleSave`, `refreshSourceView`, `handleExport`, `handleImport` all resolve the active plugin via `pluginName(forExtension:)` against `appConfig.plugins`. No hardcoded plugin names in dispatch logic.

## Key APIs (MarkupEditor package)

- `MarkupEditorView` — SwiftUI view wrapping the WKWebView editor
- `MarkupWKWebViewConfiguration` — holds userResourceFiles config
- `MarkupDelegate` — protocol for editor lifecycle callbacks (`markupDidLoad`, `markupInput`, `markupSelectImage`, `markupImageAdded`)
- `ToolbarConfig.markdown()` — returns a markdown-oriented toolbar/menu config
- `KeymapConfig.standard()` — returns default keyboard shortcut bindings

## Build

- Platform: macOS only
- Deployment target: macOS 26.3
- Swift 5.0, SwiftUI, AppKit
- Build via Xcode (use `BuildProject` tool or Xcode UI)

## Communication

Terse. Answer first, reasoning only if needed. No summaries. No repeating instructions. No confirmation for low-risk local operations.

## Code Navigation (Serena)

Serena is configured for this project via `.mcp.json`. When Serena is connected, use its LSP-backed tools for symbol navigation rather than grep or full-file reads. Three codebases are registered:

| Codebase | Project name | Root path | Language |
|----------|-------------|-----------|----------|
| MarkupEditorApp | `MarkupEditorApp` | (this project) | Swift |
| MarkupEditor package | `MarkupEditor` | `../MarkupEditor/` | Swift |
| markupeditor-base | `markupeditor-base` | `../../VSCodeProjects/markupeditor-base/` | JavaScript |

Serena project data is centralized at `~/.serena/projects/` — no `.serena` directory exists in any codebase directory. To navigate a sibling codebase, call `activate_project("<project name>")`.

**Tool quick reference (LSP backend):**

| Task | Tool |
|------|------|
| Symbol definition | `find_symbol` |
| All callers | `find_referencing_symbols` |
| File structure | `get_symbols_overview` |
| Replace function body | `replace_symbol_body` |
| Insert code | `insert_before/after_symbol` |
| Rename safely | `rename_symbol` |
| Text/comment search | `search_for_pattern` |

Use `get_symbols_overview` before reading whole files. Use `find_referencing_symbols` before any signature change. Use grep for exact text or comment searches.

**Parameter gotchas:**
- `find_referencing_symbols` requires `relative_path` to be a **file**, not a directory.
- `replace_symbol_body` does not include preceding doc comments — update those separately with the Edit tool.
- After `replace_symbol_body`, re-read the file before using Edit on the same file (Serena's replacement invalidates the Edit tool's file-state cache).

**Constraint**: `MarkupEditor` and `markupeditor-base` must not receive any commits, files, or directories that indicate Claude was used. Work on feature branches only; the user manually pushes.

## Testing

- New tests use **Swift Testing** (`@Suite`, `@Test`, `#expect`) — not XCTest for new test suites.
- `xcodebuild test -scheme MarkupEditorApp -destination 'platform=macOS'` works for unit tests.
- The `MarkupEditor` package schemes (BaseTests, SwiftTests) have a pre-existing linker failure in xcodebuild — run those from Xcode only.
- Integration over mocks: the WKWebView boundary means some flows can only be verified manually or via UI tests. Don't fake the web view in unit tests — test the model and static helpers instead.
- Swift Testing test counts in xcodebuild output reflect only XCTestCase-based tests. Count Swift Testing tests by grepping for `"Test case '.*' passed"` lines.

## Review Discipline

At each phase boundary or before merging: run `/conexus:review-code` (correctness, bugs, edge cases) then `/conexus:substantive-critique` (spec alignment, silent scope reduction, undefended assumptions). They catch different classes of issue — don't substitute one for the other.

## Important Constraints

- **Do not edit `.pbxproj` directly** while Xcode is open — Xcode must own project file changes. Use Xcode's Build Settings UI instead.
- `MarkupEditor.allowLocalImages = true` and `MarkupEditor.isInspectable = true` are set at app init — change only if intentional.

## Known Issues

- Subagents cannot spawn other subagents. Multi-agent chains must be orchestrated by the main conversation or a skill.
- Serena `find_referencing_symbols` does not resolve cross-file references without a full Xcode build index. Use grep to locate all usages across files, then Serena to edit precisely.
