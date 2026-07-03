# MarkupEditorApp

A macOS SwiftUI document editor built on the local `MarkupEditor` Swift package. The app allows creating, opening, editing, and saving HTML documents using a rich-text web-based editor.

## Project Structure

```
MarkupEditorApp/
  UI/
    MarkupEditorApp.swift      - App entry point, MarkupEditor global config
    AppDelegate.swift          - NSMenu construction, menu action notifications
    Top Level/
      MarkupDocumentView.swift - Main view, MarkupDelegate conformance, file I/O, plugin dispatch
      SourceView.swift         - Source view panel (raw HTML or plugin output)
    Info/                      - Document info UI
    Settings/                  - App settings UI
  Helpers/
    MarkupDocument.swift       - Document model (URL, metadata, save/open operations)
    PluginSetup.swift          - Plugin registration at app startup
    AppConfig.swift            - Codable config loaded from appconfig.json
    SyntaxHighlighter.swift    - Source view syntax highlighting
    Metadata/                  - YAML frontmatter parsing/encoding
  Extensions/
```

The `MarkupEditor` package is a local Swift package at `../MarkupEditor` (sibling directory).

## Architecture

- **Entry point**: `MarkupEditorApp` (`@main`) wires up `AppDelegate` via `@NSApplicationDelegateAdaptor`
- **Menu system**: `AppDelegate` builds the full `NSMenu` once, deferred to the next run loop iteration in `didFinishLaunching`. SwiftUI strips the menu between `willFinishLaunching` and `didFinishLaunching`, so the build is deferred. If an early menu is ever needed again, cache the result of `buildMenu()` rather than calling it twice.
- **Menu → View communication**: Menu actions post `NotificationCenter` notifications (e.g. `.menuSaveDocument`). `MarkupDocumentView` listens via `.task { for await notification in NotificationCenter.default.notifications(named:) }`. `SettingsView` still uses `.onReceive`. Do not use AppKit delegates or callbacks directly into the view.
- **Editor interaction**: All rich-text operations go through `MarkupEditor.selectedWebView` (a `MarkupWKWebView`). JavaScript commands use the `MU.*` namespace (e.g. `MU.insertTable()`).
- **Image selection**: Driven by `MarkupEditor.selectImage` (`@ObservedObject`) toggling a `fileImporter`.
- **Plugin dispatch**: `handleSave`, `refreshSourceView`, `handleExport`, `handleImport` all resolve the active plugin via `pluginName(forExtension:)` against `appConfig.plugins`. No hardcoded plugin names in dispatch logic.

## Key APIs (MarkupEditor package)

- `MarkupEditorView` — SwiftUI view wrapping the WKWebView editor
- `MarkupWKWebViewConfiguration` — holds userResourceFiles config
- `MarkupDelegate` — protocol for editor lifecycle callbacks (`markupDidLoad`, `markupInput`, `markupSelectImage`, `markupImageAdded`)
- `ToolbarConfig` / `KeymapConfig` — factories are `.empty()`, `.load(...)`, `.fromJSON` in the `MarkupEditor` package. The app itself calls `.fromDefaults()` (app-side extensions in `AppConfig.swift`), not a package-provided `.markdown()` or `.standard()`.

## Build

- Platform: macOS only
- Deployment target: macOS 26.3
- Swift 6.0, SwiftUI, AppKit. `SWIFT_VERSION` is set once at the project level in the `.pbxproj` and inherited by all three targets (`MarkupEditorApp`, `MarkupEditorAppTests`, `MarkupEditorAppUITests`) — no per-target overrides.
- Build via `xcodebuild` or Xcode UI

## Swift

Toolchain: Swift 6.3.3 / Xcode 26.6 (`swift --version` / `xcodebuild -version`;
re-check periodically, don't assume these stay current).

### Ground rules

- **The compiler is the oracle.** After EVERY edit: build, read the first error,
  fix, repeat. Never stack speculative edits on an unverified build.
- **API drift is your #1 failure mode.** Never assert an API exists from
  memory — verify against the local SDK or package first:
  - grep the SDK's textual interfaces:
    `grep -rl 'someModifier' "$(xcrun --show-sdk-path)"/**/*.swiftinterface`
  - or type-check a throwaway probe (no full build needed):
    `swift -typecheck /tmp/_probe.swift` — five lines importing the module
    and calling the API; delete the file after.
  - `MarkupEditor` package APIs: use Serena (`find_symbol`), not memory —
    see Code Navigation below.
- **Prefer the modern idiom** unless the file says otherwise: `@Observable`
  (not `ObservableObject`/`@Published`), `async/await` (not completion
  handlers), typed `throws(E)` where it clarifies. Deployment target is
  macOS 26.3, so no availability gating needed for any of these. Match the
  file you're editing — don't mix eras within a file.

### Build / test / run

    xcodebuild -showdestinations -scheme "MarkupEditorApp"   # never guess the destination string
    xcodebuild -scheme "MarkupEditorApp" -destination "platform=macOS" build | xcbeautify
    xcodebuild test -scheme "MarkupEditorApp" -destination "platform=macOS" \
      -only-testing:"MarkupEditorAppTests/SuiteName/testName" | xcbeautify   # narrowest scope while iterating

- `xcbeautify` is installed — pipe `xcodebuild` output through it. It only
  formats CLI `xcodebuild` output; Xcode.app's own Cmd+B build doesn't shell
  out to `xcodebuild`, so there's no in-IDE integration point for it.
- No SwiftLint/SwiftFormat config in this repo.
- This is a pure `.xcodeproj` (no `Package.swift`, no `.xcworkspace`) — the
  `MarkupEditor` and `SplitView` dependencies are resolved via Xcode's own
  package manager (`project.xcworkspace/.../Package.resolved`), not `swift
  build`/`swift test`. Those commands don't apply to this target.

### Concurrency (Swift 6 strict mode — where agents die)

- Understand the error class before editing: most Sendable/isolation errors
  mean "this crosses an isolation boundary" — fix the DESIGN, don't silence
  the compiler.
- This project's actor-isolation default is `@MainActor`
  (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), not per-declaration
  annotation. Most view/document code is implicitly main-actor already —
  check that setting before adding `@MainActor` out of habit.
- `@Sendable` closure parameters (e.g. `NotificationCenter.addObserver`'s
  `using:`) do NOT inherit isolation from `queue: .main` — the compiler
  can't see that runtime guarantee. When you know it holds, the pattern
  that actually compiles is `nonisolated(unsafe) let x = x` followed by
  `MainActor.assumeIsolated { ... }` — a bare `@MainActor` closure literal,
  `Task { @MainActor in }`, and pre-extracting values all fail with "sending
  X risks causing data races" on non-`Sendable` types like `Notification`.
  Reach for `nonisolated(unsafe)` only inside that specific pattern, never
  as a general first fix.
- Test targets calling `@testable import`-ed `@MainActor` app symbols from
  synchronous test bodies: fix by marking the **test** struct/function
  `@MainActor`, not by loosening production isolation.
- "pattern that the region-based isolation checker does not understand how
  to check" is a real compiler gap, not a sign your code is wrong — the fix
  is usually structural (extract the closure body into a named function)
  rather than an annotation workaround.

### Language discipline

- NO force-unwraps (`!`), `try!`, or `as!` in production paths. Use
  `guard let`, `??`, `do/catch`. (Tests and previews may force-unwrap
  fixtures.)
- Structs + protocols first; classes only for identity, reference semantics,
  or framework requirements.
- Closures capturing self in escaping/long-lived contexts: `[weak self]`
  and `guard let self`. `unowned` only with a lifetime proof in a comment.
- Errors: throw typed, meaningful errors; never `catch {}`-and-swallow.

### SwiftUI

- State ownership: `@State` for local, `@Observable` model objects passed by
  reference, `@Environment` for dependencies. A body over ~40 lines or mixing
  concerns is a smell — extract child views for a real reason, never solely
  to hit a line count.
- Don't invent modifiers. If unsure one exists, compile-probe it before use.

### When stuck

- 2 failed attempts at the same compiler error: stop, print the FULL error
  including notes, and re-read it — the fix is usually in the second line
  of the note.
- The Swift Evolution proposal (SE-NNNN) named in a diagnostic is the actual
  spec — search for it before improvising a workaround.

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
