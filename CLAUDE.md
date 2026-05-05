# MarkupEditorApp

A macOS SwiftUI document editor built on the local `MarkupEditor` Swift package. The app allows creating, opening, editing, and saving HTML documents using a rich-text web-based editor.

## Project Structure

```
MarkupEditorApp/
  MarkupEditorApp.swift   - App entry point, MarkupEditor global config
  ContentView.swift       - Main view, MarkupDelegate conformance, file I/O
  AppDelegate.swift       - NSMenu construction, menu action notifications
```

The `MarkupEditor` package is a local Swift package at `../MarkupEditor` (sibling directory).

## Architecture

- **Entry point**: `MarkupEditorApp` (`@main`) wires up `AppDelegate` via `@NSApplicationDelegateAdaptor`
- **Menu system**: `AppDelegate` builds the full `NSMenu` once, deferred to the next run loop iteration in `didFinishLaunching`. SwiftUI strips the menu between `willFinishLaunching` and `didFinishLaunching`, so the build is deferred. If an early menu is ever needed again, cache the result of `buildMenu()` rather than calling it twice.
- **Menu → View communication**: Menu actions post `NotificationCenter` notifications (e.g. `.menuSaveDocument`). `ContentView` listens with `.onReceive`. Do not use AppKit delegates or callbacks directly into the view.
- **Editor interaction**: All rich-text operations go through `MarkupEditor.selectedWebView` (a `MarkupWKWebView`). JavaScript commands use the `MU.*` namespace (e.g. `MU.insertTable()`).
- **Image selection**: Driven by `MarkupEditor.selectImage` (`@ObservedObject`) toggling a `fileImporter`.

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

## Code Navigation (Serena)

Serena is configured for this project via `.mcp.json`. When Serena is connected, use its LSP-backed tools for symbol navigation rather than grep or full-file reads. Four codebases are registered:

| Codebase | Project name | Root path | Language |
|----------|-------------|-----------|----------|
| MarkupEditorApp | `MarkupEditorApp` | (this project) | Swift |
| MarkupEditor package | `MarkupEditor` | `../MarkupEditor/` | Swift |
| markupeditor-base | `markupeditor-base` | `../../VSCodeProjects/markupeditor-base/` | JavaScript |

Serena project data is centralized at `~/.serena/projects/` — no `.serena` directory exists in any codebase directory. To navigate a sibling codebase, call `activate_project("<project name>")`.

Use Serena for: finding symbol definitions, listing callers, understanding type hierarchies, safe renames. Use grep for exact text or comment searches.

**Constraint**: `MarkupEditor` and `markupeditor-base` must not receive any commits, files, or directories that indicate Claude was used. Work on feature branches only; the user manually pushes.

## Important Constraints

- **Do not edit `.pbxproj` directly** while Xcode is open — Xcode must own project file changes. Use Xcode's Build Settings UI instead.
- `MarkupEditor.allowLocalImages = true` and `MarkupEditor.isInspectable = true` are set at app init — change only if intentional.
