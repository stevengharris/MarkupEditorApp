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
- **Menu system**: `AppDelegate` builds the full `NSMenu` twice (in `willFinishLaunching` and `didFinishLaunching`) because SwiftUI strips custom menus between the two callbacks. This is intentional — do not simplify.
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

## Important Constraints

- **Do not edit `.pbxproj` directly** while Xcode is open — Xcode must own project file changes. Use Xcode's Build Settings UI instead.
- The double `buildMenu()` call in `AppDelegate` is required; SwiftUI strips the menu between `willFinishLaunching` and `didFinishLaunching`.
- `MarkupEditor.allowLocalImages = true` and `MarkupEditor.isInspectable = true` are set at app init — change only if intentional.
