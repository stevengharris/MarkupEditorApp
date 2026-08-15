# Codeview Plugin Reference

Full detail behind `SKILL.md`'s quick-reference table. Read the relevant section before implementing that part of your plugin -- these are non-obvious enough that the one-line summaries alone will lead you wrong.

## setProps Swaps the Whole docView, Even Mid-Session

Plugins load via `userScript`, well after markupeditor-base's own `EditorView` already exists with `code_block` nodes already rendered under the original factory. `view.setProps({ nodeViews: {...} })` still works on that already-rendered view: ProseMirror detects the `nodeViews` reference change and destroys/rebuilds the entire `docView` -- not just the `code_block` NodeViews, every NodeView in the document. This is a full teardown/rebuild, not a targeted patch. Verify this against your prosemirror-view version if it matters to your design; don't assume it stays a cheap operation.

## A NodeView's own update() Does Not Fire on a Pure Position Shift

If your plugin cares WHERE a node sits (not just its language/content -- e.g. "only render live if this is the first block in the document"), do not rely on `update()` to notice a preceding sibling insert shifting your node's position. Verified empirically: `getPos()` is a live closure and correctly reflects the new position immediately, the NodeView instance survives (not destroyed/recreated), but `update()` is never invoked for a pure position shift with no attrs/content change. `update()`'s own position check can never fire for exactly the case it exists to catch.

The actual mechanism: track live instances in a `Set` (add in constructor, remove in `destroy()`), and drive re-checks from a `Plugin.view.update` hook instead -- that DOES fire on every transaction:

```js
static checkAllPositions() {
    for (const instance of liveInstances) {
        if (instance.getPos() !== 0) instance.forceSourceOnly()
    }
}
```

Call `checkAllPositions()` from your plugin's `Plugin.view.update` hook. Keep `update()`'s own check too, as defense in depth for the (unobserved, not provably impossible) case of a content-changing edit that also shifts position -- just don't rely on it alone.

## Sanitize Before Rendering Untrusted Content

Mermaid's `render()` produces trusted SVG from a diagram-description language -- no sanitization needed. If your plugin's render path sets `innerHTML` from arbitrary document content instead (e.g. rendering raw HTML the user wrote or imported), that's a real XSS surface the moment someone opens a file they didn't author. Use DOMPurify (or equivalent), default config, as a plugin-local `package.json` dependency -- same category as Mermaid's own dependency on the `mermaid` npm package. Cache the sanitized output alongside your cached input text, not just the input -- re-running sanitize on every paint even on a cache hit is wasted work and an easy bug to introduce.

## Language Changing to Your Language, Mid-Document

The Language dialog mutates `node.attrs.language` on the SAME node identity -- ProseMirror calls `update()` on the EXISTING instance rather than reconsulting the factory. An instance that isn't yours (a plain `CodeView`, or another plugin's wrapped variant) has no reason to know your language exists. Wrap the delegate instance's own `update()`, on the constructed object, not its class:

```js
wrapForYourUpgrade(instance, getPos) {
    const delegateUpdate = instance.update.bind(instance)
    instance.update = (node) => isYourLanguage(node.attrs.language) ? false : delegateUpdate(node)
    return instance
}
```

Returning `false` tells ProseMirror to discard this one instance and re-consult the factory -- a per-node rebuild, not the whole-document redraw `setProps` causes. Capture `getPos` from the factory closure if you need it here, not read off the instance -- a plain `CodeView` isn't guaranteed to expose `getPos()` as a property.

## Native macOS Paste Bypasses the DOM Entirely

Cmd+V on macOS never reaches the DOM as a paste event when the selection is inside a `<pre>`: `NSResponder.paste(_:)` (`MarkupWKWebView.swift`) reads `NSPasteboard` directly and calls `MU.pasteCode(text)` via `executeJavaScript`, bypassing `handleDOMEvents.paste` entirely. `MU.pasteCode` is a plain insert-at-cursor with no notion of "this block is atomically selected, replace its whole content." Wrap `MU.pasteCode` itself (never modify it in markupeditor-base, which has no reason to know about your plugin) to catch this regardless of which path invoked it:

```js
wrapPasteCodeForYourPlugin(view) {
    const originalPasteCode = MU.pasteCode
    MU.pasteCode = (text) => {
        const blockPos = this.selectedYourBlockPos(view)
        if (blockPos === null) return originalPasteCode(text)
        // replace the whole block's content with `text`, not insert-at-cursor
    }
}
```

## Adopting Your Stylesheet

```js
adoptYourStyles(view) {
    const root = view.dom.getRootNode()
    if (!root.adoptedStyleSheets?.includes(yourStyle)) {
        root.adoptedStyleSheets = [...root.adoptedStyleSheets, yourStyle]
    }
}
```

Import your CSS as `import yourStyle from "../styles/your.css" with { type: "css" }`. This app targets `WKWebView` only -- don't carry cross-browser vendor prefixes like `-moz-selection` into a plugin's CSS; that's Firefox-only dead weight here (`markupeditor-base`'s own styles legitimately target multiple browsers -- don't copy that pattern into a plugin without the same requirement). If rendered content lives inside a `<pre>` (inherited from `MU.CodeView`), remember `white-space: pre` is CSS-inheritable -- explicitly reset it on your rendered container if it needs to flow normally, or newlines in your source will render as forced line breaks.

## Testing

Mirror the existing plugins' file split: a plugin-level test (factory wiring, keyboard/clipboard/paste handling, language-dialog integration) and a view-level test (the NodeView class in isolation via a hand-wired `nodeViews` factory). Add a dedicated mechanism test only if you're verifying a genuinely novel ProseMirror assumption empirically -- don't keep it around once a real-class test covers the same ground elsewhere in your suite.

Every codeview test constructs a real `EditorView`, so it needs the real jsdom setup -- see `writing-markupeditor-plugins`'s Testing section for the config and `test-setup-shim.js`. Add your own `markupeditor-sync.test.js` alongside the other test files too (copy an existing plugin's) -- it's what keeps the `markupeditor` npm dependency from silently drifting out of sync with the bundle the app actually ships, now that plugins depend on the published package directly rather than a build-time alias.
