/**
 * Mock `CSSStyleSheet.replaceSync` for JSDOM testing
 */
if (!('replaceSync' in CSSStyleSheet.prototype)) {
  Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
    value(cssText) {
      this.cssText = cssText;
      return cssText;
    },
  });
}

/**
 * Mock `CSSStyleSheet.media` for JSDOM testing. jsdom's CSS Module Script
 * support (`with { type: "css" }`, used by markupeditor-base's main.js for the
 * hljs dark-theme stylesheet) doesn't implement a MediaList, so
 * `hljsDarkStyle.media.mediaText = '...'` throws at module-load time. A plain
 * object with a writable mediaText is enough for that side effect to succeed.
 */
if (!('media' in CSSStyleSheet.prototype)) {
  Object.defineProperty(CSSStyleSheet.prototype, 'media', {
    value: { mediaText: '' },
    writable: true,
    configurable: true,
  });
}

/**
 * ProseMirror has some hacks to work around access to the Shadow DOM selection
 * on Safari that use document.execCommand, but these are not relevant to the
 * testing and can be no-ops.
 */
if (typeof document.execCommand === 'undefined') document.execCommand = ()=>{}

/**
 * jsdom doesn't implement `document.adoptedStyleSheets` (a real browser
 * initializes it to an empty, spreadable array). A codeview plugin's own
 * stylesheet-adoption step reads and spreads it on first widget render, which
 * only a real EditorView-based test ever exercises.
 */
if (!('adoptedStyleSheets' in document)) document.adoptedStyleSheets = []
