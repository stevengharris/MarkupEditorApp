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

* **Entry point**: `MarkupEditorApp` (`@main`) wires up `AppDelegate` via `@NSApplicationDelegateAdaptor`

* **Menu system**: `AppDelegate` builds the full `NSMenu` once, deferred to the next run loop iteration in `didFinishLaunching`. SwiftUI strips the menu between `willFinishLaunching` and `didFinishLaunching`, so the build is deferred. If an early menu is ever needed again, cache the result of `buildMenu()` rather than calling it twice.

* **Menu → View communication**: Menu actions post `NotificationCenter` notifications (e.g. `.menuSaveDocument`). `MarkupDocumentView` listens via `.task { for await notification in NotificationCenter.default.notifications(named:) }`. `SettingsView` still uses `.onReceive`. Do not use AppKit delegates or callbacks directly into the view.

* **Editor interaction**: All rich-text operations go through `MarkupEditor.selectedWebView` (a `MarkupWKWebView`). JavaScript commands use the `MU.*` namespace (e.g. `MU.insertTable()`).

* **Image selection**: Driven by `MarkupEditor.selectImage` (`@ObservedObject`) toggling a `fileImporter`.

* **Plugin dispatch**: `handleSave`, `refreshSourceView`, `handleExport`, `handleImport` all resolve the active plugin via `pluginName(forExtension:)` against `appConfig.plugins`. No hardcoded plugin names in dispatch logic.

## Key APIs (MarkupEditor package)

* `MarkupEditorView` — SwiftUI view wrapping the WKWebView editor

* `MarkupWKWebViewConfiguration` — holds userResourceFiles config

* `MarkupDelegate` — protocol for editor lifecycle callbacks (`markupDidLoad`, `markupInput`, `markupSelectImage`, `markupImageAdded`)

* `ToolbarConfig` / `KeymapConfig` — factories are `.empty()`, `.load(...)`, `.fromJSON` in the `MarkupEditor` package. The app itself calls `.fromDefaults()` (app-side extensions in `AppConfig.swift`), not a package-provided `.markdown()` or `.standard()`.

## Build

* Platform: macOS only

* Deployment target: macOS 26.3

* Swift 6.0, SwiftUI, AppKit. `SWIFT_VERSION` is set once at the project level in the `.pbxproj` and inherited by all three targets (`MarkupEditorApp`, `MarkupEditorAppTests`, `MarkupEditorAppUITests`) — no per-target overrides.

* Build via `xcodebuild` or Xcode UI

## Swift

Toolchain: Swift 6.3.3 / Xcode 26.6 (`swift --version` / `xcodebuild -version`; re-check periodically, don't assume these stay current).

### Ground rules

* **The compiler is the oracle.** After EVERY edit: build, read the first error, fix, repeat. Never stack speculative edits on an unverified build.

* **API drift is your #1 failure mode.** Never assert an API exists from memory — verify against the local SDK or package first:

  * grep the SDK's textual interfaces: `grep -rl 'someModifier' "$(xcrun --show-sdk-path)"/**/*.swiftinterface`

  * or type-check a throwaway probe (no full build needed): `swift -typecheck /tmp/_probe.swift` — five lines importing the module and calling the API; delete the file after.

  * `MarkupEditor` package APIs: use agent-lsp (`find_symbol`), not memory — see Code Navigation below.

* **Prefer the modern idiom** unless the file says otherwise: `@Observable` (not `ObservableObject`/`@Published`), `async/await` (not completion handlers), typed `throws(E)` where it clarifies. Deployment target is macOS 26.3, so no availability gating needed for any of these. Match the file you're editing — don't mix eras within a file.

### Build / test / run

```
xcodebuild -showdestinations -scheme "MarkupEditorApp"   # never guess the destination string
xcodebuild -scheme "MarkupEditorApp" -destination "platform=macOS" build | xcbeautify
xcodebuild test -scheme "MarkupEditorApp" -destination "platform=macOS" \
  -only-testing:"MarkupEditorAppTests/SuiteName/testName" | xcbeautify   # narrowest scope while iterating
```

* `xcbeautify` is installed — pipe `xcodebuild` output through it. It only formats CLI `xcodebuild` output; Xcode.app's own Cmd+B build doesn't shell out to `xcodebuild`, so there's no in-IDE integration point for it.

* No SwiftLint/SwiftFormat config in this repo.

* This is a pure `.xcodeproj` (no `Package.swift`, no `.xcworkspace`) — the `MarkupEditor` and `SplitView` dependencies are resolved via Xcode's own package manager (`project.xcworkspace/.../Package.resolved`), not `swift build`/`swift test`. Those commands don't apply to this target.

### Concurrency (Swift 6 strict mode — where agents die)

* Understand the error class before editing: most Sendable/isolation errors mean "this crosses an isolation boundary" — fix the DESIGN, don't silence the compiler.

* This project's actor-isolation default is `@MainActor` (`SWIFT_DEFAULT_ACTOR_ISOLATION = MainActor`), not per-declaration annotation. Most view/document code is implicitly main-actor already — check that setting before adding `@MainActor` out of habit.

* `@Sendable` closure parameters (e.g. `NotificationCenter.addObserver`'s `using:`) do NOT inherit isolation from `queue: .main` — the compiler can't see that runtime guarantee. When you know it holds, the pattern that actually compiles is `nonisolated(unsafe) let x = x` followed by `MainActor.assumeIsolated { ... }` — a bare `@MainActor` closure literal, `Task { @MainActor in }`, and pre-extracting values all fail with "sending X risks causing data races" on non-`Sendable` types like `Notification`. Reach for `nonisolated(unsafe)` only inside that specific pattern, never as a general first fix.

* Test targets calling `@testable import`-ed `@MainActor` app symbols from synchronous test bodies: fix by marking the **test** struct/function `@MainActor`, not by loosening production isolation.

* "pattern that the region-based isolation checker does not understand how to check" is a real compiler gap, not a sign your code is wrong — the fix is usually structural (extract the closure body into a named function) rather than an annotation workaround.

### Language discipline

* NO force-unwraps (`!`), `try!`, or `as!` in production paths. Use `guard let`, `??`, `do/catch`. (Tests and previews may force-unwrap fixtures.)

* Structs + protocols first; classes only for identity, reference semantics, or framework requirements.

* Closures capturing self in escaping/long-lived contexts: `[weak self]` and `guard let self`. `unowned` only with a lifetime proof in a comment.

* Errors: throw typed, meaningful errors; never `catch {}`-and-swallow.

### SwiftUI

* State ownership: `@State` for local, `@Observable` model objects passed by reference, `@Environment` for dependencies. A body over \~40 lines or mixing concerns is a smell — extract child views for a real reason, never solely to hit a line count.

* Don't invent modifiers. If unsure one exists, compile-probe it before use.

### When stuck

* 2 failed attempts at the same compiler error: stop, print the FULL error including notes, and re-read it — the fix is usually in the second line of the note.

* The Swift Evolution proposal (SE-NNNN) named in a diagnostic is the actual spec — search for it before improvising a workaround.

## Communication

Terse. Answer first, reasoning only if needed. No summaries. No repeating instructions. No confirmation for low-risk local operations.

## Code Navigation (agent-lsp)

agent-lsp is configured for this project via `.mcp.json` (single `lsp` MCP server, args `swift:sourcekit-lsp javascript:typescript-language-server,--stdio`). When connected, use its LSP-backed tools for symbol navigation rather than grep or full-file reads. Three codebases, navigated by root directory (agent-lsp has no named-project concept — unlike Serena, which it replaced):

| Codebase | Root path | Language |
| --- | --- | --- |
| MarkupEditorApp | (this project) | Swift |
| MarkupEditor package | ../MarkupEditor/ | Swift |
| markupeditor-base | ../../VSCodeProjects/markupeditor-base/ | JavaScript |

All state lives in `~/.agent-lsp/cache/` — verified empirically (repeated `git status --short --ignored` sweeps in both MarkupEditor and markupeditor-base after real symbol/reference queries) that no file or directory is ever written inside any of the three repos.

**Switching between the three codebases**: call `start_lsp(root_dir: "<path>", language_id: "swift"|"javascript")` for the codebase you need. A second `start_lsp` call **replaces** the active root — it does not add to it. Re-open any file you're about to query with `open_document` after switching roots.

**Do not use `add_workspace_folder` for Swift cross-repo work.** Verified broken: adding a second folder to an active Swift session breaks `list_symbols`/`find_references`/`inspect_symbol` for every file in the *original* root too (`-32001: No language service found`), even after re-opening the document and even though the index data is present on disk. Recovery requires a clean `start_lsp` restart on a single root. agent-lsp's own docs only list gopls/rust-analyzer/typescript-language-server as multi-root-capable — sourcekit-lsp isn't among them, so this isn't a surprise in hindsight. For cross-repo Swift references (e.g. a MarkupEditor symbol used in MarkupEditorApp), switch roots with `start_lsp` and re-query rather than trying to hold both open at once.

**Tool quick reference:**

| Task | Tool |
| --- | --- |
| Symbol definition | find_symbol (workspace-wide, by name) |
| All callers | find_references (file + line/column or position_pattern) |
| Callers partitioned test/non-test, before any edit | blast_radius — call this before editing any file; replaces manual find_references loops |
| File structure | list_symbols (pass format: "outline" for compact output) |
| Full context on a symbol in one call | explore_symbol (type, source, callers, references, test-caller count) |
| Replace function body | replace_symbol_body |
| Insert code | insert_before_symbol / insert_after_symbol |
| Rename safely | rename_symbol |
| Text/comment search | grep — agent-lsp has no pattern-search tool |

Call `list_symbols` before reading whole files. Call `blast_radius` before any signature change.

**Gotchas:**

* **Swift needs a warm-up.** The first `start_lsp` call against a Swift root triggers a real background build (`.build/index-build/`) to populate sourcekit-lsp's index. Document-scoped calls (`list_symbols`, `find_references`, `inspect_symbol`) fail with `-32001: No language service found` until that completes — only workspace-wide `find_symbol` works during the warm-up window. Pass a generous `ready_timeout_seconds` (60+) and retry once if a document-scoped call fails right after `start_lsp`. JavaScript (markupeditor-base) has no equivalent warm-up — it works on the first call.

* **markupeditor-base needs a local `typescript` install** for `typescript-language-server` to resolve `tsserver` — the repo is plain JavaScript with no `typescript` devDependency of its own, and the *global* npm `typescript` (currently the v7 native-Go rewrite) doesn't ship the classic `tsserver.js` the LSP server needs. Fixed via `npm install typescript@5.4.5 --no-save` inside `markupeditor-base` — `--no-save` keeps it out of `package.json`/`package-lock.json`, landing only in the gitignored `node_modules/`. Don't add it as a real devDependency; re-run the same `--no-save` install if `node_modules` ever gets wiped.

* Use `javascript` as the language ID for markupeditor-base, not `typescript` — the repo has zero `.ts` files (68 `.js`). Both language IDs route to the same `typescript-language-server` binary, but `javascript` is the one that actually matches the files.

**Constraint**: `MarkupEditor` and `markupeditor-base` must not receive any commits, files, or directories that indicate Claude was used. Work on branches only; the user manually pushes.

## Comment Discipline

Code comments must be terse and describe only the technical issues being commented upon, including, if needed, reasoning behind a particular implementation choice. Comments must not reference RDRs, beads, or elements within a Claude session.

## Cross-Project Changes (markupeditor-base → MarkupEditor → MarkupEditorApp)

Some changes originate in `markupeditor-base` (the ProseMirror schema/JS layer) and must propagate through `MarkupEditor` (the Swift package) before they're usable in `MarkupEditorApp`. RDR-020 (Add Language Attribute to Code) established the working pattern below.

### Order of work

Strictly sequential, one repo at a time, each with its own approval gate before commit:

1. **`markupeditor-base`** — implement the schema/behavior change, TDD with vitest.

2. **`MarkupEditor`** — verify the change end-to-end via the Swift Testing suite, which consumes `markupeditor-base`'s own `test/*.json` fixtures.

3. **`MarkupEditorApp`** (`markupeditor-markdown`, or app-layer code) — build on the verified change.

Do not skip straight to step 3 assuming step 1's change "obviously works" — the Swift package's WKWebView-based execution is a different runtime than markupeditor-base's Node/vitest environment, and only step 2 proves the compiled bundle behaves correctly there.

### Work using ProseMirror

Coding in markupeditor-base, MarkupEditor, and MarkupEditorApp may require accessing the DOM and using ProseMirror. ProseMirror work must be done only accessing its public APIs, which are documented at <https://prosemirror.net/docs/ref/version/0.17.0.html>. DO NOT base feature/function implementations on the ProseMirror source. Access to ProseMirror source (from node_modules, for example) should ONLY be used during debugging or to examine how a function works internally when called, NOT to base a markupeditor-base or other implementation on. When possible, base new functionality that uses ProseMirror, for example, in writing a new ProseMirror plugin, on existing markupeditor-base or other work that uses ProseMirror.

### Local iteration: getting an unpublished markupeditor-base change into MarkupEditor

`markupeditor-js/prepare.sh` copies `dist/markup-editor.js` and `test/*.json` from `./node_modules/markupeditor/` into `MarkupEditor/Resources/` and `MarkupEditorTests/BaseTests/Data/`. By default that's the **npm-installed registry package**, not your local checkout — and the registry package excludes `test/` entirely (its `package.json` `"files"` field is `["dist","bin","styles","config"]`), so a plain registry install can never pick up test fixtures, regardless of how recently it was published.

To point at a local, unpublished checkout:

```json
// markupeditor-js/package.json
"devDependencies": {
  "markupeditor": "file:/absolute/path/to/markupeditor-base"
}
```

```bash
cd markupeditor-js
npm update        # or: npm install
```

`npm update`/`npm install` alone is sufficient — `prepare` is an npm-reserved lifecycle hook name, and this project's `"prepare": "sh prepare.sh"` script runs automatically as part of that command. Verified empirically: deleting a copied fixture and re-running plain `npm install` restored it without invoking `prepare.sh` separately. No need for a distinct `sh prepare.sh` step.

**Use a `file:` dependency, not `npm link`.** Both resolve to a symlink in this npm version (so `test/` is fully visible either way), but `file:` is declared in `package.json` — visible in diffs, trivially greppable, and easy to revert — where `npm link` registers untracked global npm state that's easy to forget about.

**This is temporary and must be reverted before merging.** The `file:` path is absolute and machine-specific; `npm install`/`npm ci` breaks on any other machine or in CI while it's in place. Reverting is *not* a plain text edit: switching to `file:` prunes the transitive dependency tree out of `package-lock.json` (npm resolves those packages through the linked checkout's own `node_modules` instead of flattening them locally), so reverting means bumping `devDependencies.markupeditor` to a real registry semver range (once `markupeditor-base` publishes the merged change) *and* regenerating the lockfile via a real `npm install` — not a hand-edit. Track this as its own bead/task blocked on the publish, not just "something to remember."

### Testing in markupeditor-base

While testing in markupeditor-base uses vitest, it follows a pattern that specifies test data in json files. Each test uses its paired json file to define the test and then executes based on that data. This approach allows the test data to be consumed in the Swift MarkupEditor later and be tested there using Swift Testing. There may be cases where the separation between test data and the test itself is not useful, because what is being tested is not useful to test in Swift due to limitations in Swift testing or the Swift MarkupEditor. In these cases, the separate json test file approach can be skipped, bot only with explicit approval.

### Testing MarkupEditor from the CLI

The `MarkupEditor` package schemes are **not** Xcode-GUI-only — the CLI works fine, but two things matter:

* **Use `-scheme MarkupEditor`**, not `-scheme BaseTests` alone — the `MarkupEditor` scheme is the one configured with valid macOS/Mac Catalyst/iOS destinations. `-showdestinations -scheme BaseTests` only lists iOS Simulator, which will mislead you into thinking macOS isn't supported at all.

* **Always use `xcodebuild clean test`, not `test`.** Switching between destinations (e.g. iOS Simulator, then macOS) against the same `DerivedData` without cleaning produces spurious "Undefined symbol" linker failures that look like a fundamental platform incompatibility but are actually just stale build products from the previous destination. `.github/workflows/swift.yml` always does `clean test` — mirror that.

```bash
xcodebuild clean test -scheme MarkupEditor -destination 'platform=macOS,arch=arm64' -parallel-testing-enabled NO
xcodebuild clean test -scheme MarkupEditor -destination 'platform=macOS,variant=Mac Catalyst,arch=arm64' -parallel-testing-enabled NO
xcodebuild clean test -scheme MarkupEditor -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.5' -parallel-testing-enabled NO
```

All three should pass. CI (`.github/workflows/swift.yml`) only runs the macOS and Mac Catalyst legs of this matrix — iOS Simulator is skipped there purely because it's unreliable in GitHub Actions, not because it doesn't work. Verify iOS Simulator locally too when a change might affect UIKit-specific code paths.

### New files aren't picked up automatically

`MarkupEditor.xcodeproj` uses Xcode 16 file-system-synchronized groups with explicit per-file target membership exceptions in `project.pbxproj`. A new `.swift` test file or a new `.json` fixture copied into `MarkupEditorTests/BaseTests/Data/` will **not** be included in the `BaseTests` target just by existing on disk — `xcodebuild` will report `0 tests` for it silently (or "Data file could not be located in bundle resources" for a fixture) rather than erroring.

**Do not edit `project.pbxproj` directly to fix this** (same rule as `MarkupEditorApp`'s constraint) — ask the user to add the new file(s) to the target in Xcode, then re-run the CLI build to confirm.

### Writing a new Swift Testing suite for a markupeditor-base fixture

Each `test/*.json` fixture in `markupeditor-base` needs a **hand-written, parallel Swift file** in `MarkupEditorTests/BaseTests/` — there is no generic fixture-to-test translator. Mirror an existing file with a similar shape (`Style.swift` for style-only actions, `PasteHtmlPreprocessing.swift` for a combined set+get string action, `Baseline.swift` for pure round-trip fixtures with no `action` field at all):

* A fixture test case with **no `action` field** in the JSON → use `HtmlTest.run(action: nil, in: webView)`. Note this path only asserts `setTestHtml`'s return against `startHtml`, but `setTestHtml` itself round-trips through a real `parseDOM`/`toDOM` parse — it's a meaningful check, not a no-op, as long as `startHtml == endHtml` in the fixture (i.e. it's genuinely a round-trip-identity case).

* A fixture test case with **`skipSet: true`** and a combined JS action (e.g. `MU.setTestHTML(startHtml, '|'); return MU.getTestHTML('|')`) → write a Swift closure combining `webview.setTestHtml(...)` and `webview.getTestHtml(...)`, matching the second `HtmlTest.run(action:in:)` overload (`(MarkupWKWebView) async -> String?`).

* If a single fixture file mixes both kinds of test case (as `code-language.json` does), build a per-index array of *optional* closures and branch on `nil` vs. present at the call site — don't force every test case in a file through the same overload.

### Namespace discipline for review/critique agents

When dispatching `code-review-expert` or `substantive-critic` against `markupeditor-base` or `MarkupEditor` files, **explicitly tell them to write any T2/T3 findings under `project="MarkupEditorApp"`, never the downstream repo's own name.** Those agents' own post-flight instructions default to `memory_put(project="<repo>", ...)`, inferring `<repo>` from the file paths they were given — without an explicit override they will infer `project="markupeditor-base"` or `project="MarkupEditor"`, scattering RDR-related notes outside the project where all RDR/T2 activity is supposed to live. Confirmed as a near-miss during RDR-020 (caught in a permission prompt before it happened).

### Branch and commit conventions (all three repos)

* **No `feature/` prefix.** Bare descriptive branch names (e.g. `addCodeLanguage`), matched across repos for the same piece of work.

* **No commit without explicit user approval**, at every repo, every phase boundary — present the diff and test results, wait for an explicit yes.

* **`markupeditor-base` and `MarkupEditor`**: single-line commit messages, no RDR/MarkupEditor/MarkupEditorApp references, nothing indicating Claude was used.

* **`MarkupEditorApp`**: commits may reference the RDR.

* User pushes manually in all three repos — never push on their behalf.

## Testing

* New tests use **Swift Testing** (`@Suite`, `@Test`, `#expect`) — not XCTest for new test suites.

* `xcodebuild test -scheme MarkupEditorApp -destination 'platform=macOS'` works for unit tests.

* For `MarkupEditor` package tests (BaseTests, SwiftTests), see "Testing MarkupEditor from the CLI" under Cross-Project Changes above — use `-scheme MarkupEditor` with `xcodebuild clean test`, not `-scheme BaseTests` with a bare `test`.

* Integration over mocks: the WKWebView boundary means some flows can only be verified manually or via UI tests. Don't fake the web view in unit tests — test the model and static helpers instead.

* Swift Testing test counts in xcodebuild output reflect only XCTestCase-based tests. Count Swift Testing tests by grepping for `"Test case '.*' passed"` lines.

## Review Discipline

At each phase boundary or before merging: run `/conexus:review-code` (correctness, bugs, edge cases) then `/conexus:substantive-critique` (spec alignment, silent scope reduction, undefended assumptions). They catch different classes of issue — don't substitute one for the other.

## Important Constraints

* **Do not edit `.pbxproj` directly** while Xcode is open — Xcode must own project file changes. Use Xcode's Build Settings UI instead.

* `MarkupEditor.allowLocalImages = true` and `MarkupEditor.isInspectable = true` are set at app init — change only if intentional.

## Known Issues

* Subagents cannot spawn other subagents. Multi-agent chains must be orchestrated by the main conversation or a skill.

* agent-lsp's `add_workspace_folder` breaks Swift document-scoped queries (`list_symbols`/`find_references`/`inspect_symbol`) across the *entire* session, not just the added folder — see Code Navigation's gotchas. Switch roots with `start_lsp` instead of adding a second workspace folder.