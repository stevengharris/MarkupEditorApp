---
name: writing-codeview-plugins
description: Use when building a MarkupEditor codeview plugin -- code that changes how a fenced code block of a specific language renders inside the live document (as a diagram, live HTML, or other non-text output) instead of plain code text.
---

# Writing Codeview Plugins

**REQUIRED BACKGROUND:** `developing-markupeditorapp` and `writing-markupeditor-plugins` -- read both first. This skill assumes you already know the three-repo architecture and the general plugin contract; it covers only what's specific to codeview plugins.

## Overview

A codeview plugin changes how one specific kind of content inside a MarkupEditor document is displayed and edited: instead of showing a fenced code block's raw text, it renders that text as something else -- a diagram, live HTML, syntax-highlighted output -- while the document still stores it as plain code-block text underneath. Two reference plugins exist to model yours on: `plugins/markupeditor-codeview-mermaid` (renders Mermaid diagram syntax) and `plugins/markupeditor-codeview-frontmatter` (renders raw HTML, with an added position constraint). Read both before starting.

**ProseMirror** is the rich-text editor markupeditor-base is built on. Read ProseMirror's own guide to NodeViews (https://prosemirror.net/docs/guide/#view.node_views) before anything else here: a NodeView is a class that takes over rendering for one node type in the document; `EditorProps.nodeViews` is the map of node-type name to constructor function ("factory") ProseMirror calls whenever it needs to render a node of that type. markupeditor-base installs `MU.CodeView` as the DEFAULT `nodeViews.code_block` factory the moment its `EditorView` is constructed (`src/markupeditor.js:223`: `code_block(node, view, getPos) { return new CodeView(node, view, getPos, languageDialog) }`) -- every `code_block` renders as plain text via `MU.CodeView` until a codeview plugin says otherwise. Your plugin arrives well after that factory is already installed and already rendering the open document (see `developing-markupeditorapp`'s load-order note) -- that's why the Core Pattern below looks the way it does.

## When to Use

- Building a new codeview plugin (any language-triggered live rendering of a `code_block`).
- Debugging why a codeview plugin's NodeView factory doesn't take effect, or why two independently-installed codeview plugins clobber each other's rendering.
- Not for exporters (File → Export transforms) -- see `plugins/README.md`'s DocX reference instead.

## Core Pattern: capture-wrap-delegate

Because your plugin arrives after `MU.CodeView` (or possibly another plugin) is already installed as the `code_block` factory, your `install()` must capture whatever factory is CURRENTLY there, wrap it, and swap the wrapped version in live -- never assume the prior factory is `MU.CodeView` specifically, and never construct a fresh one of your own for languages you don't own:

```js
install() {
    const view = MU.activeView()
    if (!view) return

    const codeBlockFactory = this.makeCodeBlockFactory(view.props.nodeViews.code_block, MU.languageDialog)
    view.setProps({ nodeViews: { ...view.props.nodeViews, code_block: codeBlockFactory } })

    MU.registerPlugin({ name: 'YourPluginName', type: 'codeview' })
}

makeCodeBlockFactory(originalFactory, languageDialog, viewOptions = {}) {
    return (node, view, getPos) => {
        if (isYourLanguage(node.attrs.language)) {
            return new YourView(node, view, getPos, languageDialog, viewOptions)
        }
        return this.wrapForYourUpgrade(originalFactory(node, view, getPos))
    }
}
```

`view.props.nodeViews.code_block` is captured AT LOAD TIME inside `install()`, not read from a module-level cache -- this is what makes the chain compose with zero coordination between plugins. `loadPlugins` (markupeditor-base) imports every plugin path concurrently via `Promise.all`, so real load order between independently-authored plugins is not guaranteed reproducible run-to-run. Each plugin only ever wraps "whatever is there right now" -- `MU.CodeView` if it's first, or another plugin's own wrapped factory if it's not -- so the chain composes correctly regardless of order.

**The mistake this catches**: a plugin that constructs `new CodeView(...)` directly for its fallback case instead of calling the captured `originalFactory` silently discards whatever any previously-installed plugin wired up -- no error, no warning. Always delegate to the captured factory, never reconstruct.

## Quick Reference

Five more non-obvious mechanisms, each verified empirically against the two reference plugins -- full explanation and code for each in `reference.md`:

| Topic | One-line summary |
|---|---|
| `setProps` and the whole docView | Installing your factory live (into a view that already has rendered nodes) destroys/rebuilds every NodeView in the document, not just yours. |
| Position tracking | A NodeView's own `update()` never fires for a pure position shift -- drive re-checks from a `Plugin.view.update` hook instead. |
| Sanitization | Rendering untrusted content (not trusted generator output like Mermaid's SVG) needs DOMPurify before any `innerHTML` assignment. |
| Language-change upgrade | The Language dialog mutates `node.attrs.language` in place -- wrap the delegate instance's own `update()` to catch a plain block becoming yours. |
| Native macOS paste | Cmd+V inside a `<pre>` bypasses DOM paste events entirely on macOS (handled in the `MarkupEditor` Swift package) -- wrap `MU.pasteCode` itself. |

Also in `reference.md`: styling (WKWebView-only CSS, `white-space` inheritance inside `<pre>`) and the jsdom test setup every codeview test needs.

## Common Mistakes

| Mistake | Fix |
|---|---|
| Constructing a fresh fallback factory instead of delegating to the captured original | Always call the captured `originalFactory`/delegate for languages you don't own |
| Relying on `update()` alone for position-dependent behavior | Add a `Plugin.view.update` hook driving an active re-check across a `liveInstances` Set (see `reference.md`) |
| Rendering arbitrary HTML content without sanitizing | DOMPurify (or equivalent) before any `innerHTML` assignment from untrusted content |
| Re-sanitizing on every paint | Cache sanitized output alongside cached input, not just the input |
| Testing only via simulated keyboard events | Dispatch transactions directly (`view.dispatch(state.tr.insert(...))`) for edits no current keyboard gesture can trigger |
| Carrying `-moz-selection`/other cross-browser CSS into a plugin | This app ships via `WKWebView` only; skip vendor prefixes for other engines |
| Reading `getPos` off a delegate instance in an upgrade wrapper | Capture `getPos` from the factory closure instead -- not guaranteed to be an instance property |

Read `reference.md` before implementing -- the quick-reference summaries above are not enough on their own to get the position-tracking, sanitization, or paste-bypass mechanisms right.
