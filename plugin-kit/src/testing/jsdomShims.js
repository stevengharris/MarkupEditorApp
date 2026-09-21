// Setup file for tests that load the real `markupeditor` bundle under jsdom. Guarded: it runs
// for every test file regardless of its @vitest-environment pragma, including plain node, where
// there is no CSSStyleSheet or document.
if (typeof CSSStyleSheet !== 'undefined') {
  // jsdom has no CSSStyleSheet.replaceSync.
  if (!('replaceSync' in CSSStyleSheet.prototype)) {
    Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
      value(cssText) {
        this.cssText = cssText
        return cssText
      },
    })
  }

  // jsdom's CSS Module Script support (`with { type: "css" }`, used by markupeditor-base's
  // main.js for the hljs dark-theme stylesheet) doesn't implement a MediaList, so
  // `hljsDarkStyle.media.mediaText = '...'` throws at module-load time. A plain object with a
  // writable mediaText is enough for that side effect to succeed.
  if (!('media' in CSSStyleSheet.prototype)) {
    Object.defineProperty(CSSStyleSheet.prototype, 'media', {
      value: { mediaText: '' },
      writable: true,
      configurable: true,
    })
  }
}

if (typeof document !== 'undefined') {
  // ProseMirror has Safari Shadow DOM selection workarounds that call document.execCommand;
  // they are irrelevant to tests and can be no-ops.
  if (typeof document.execCommand === 'undefined') document.execCommand = () => {}

  // jsdom doesn't implement document.adoptedStyleSheets (a browser initializes it to an empty,
  // spreadable array). Plugins that adopt styles read and spread it on first widget render.
  if (!('adoptedStyleSheets' in document)) document.adoptedStyleSheets = []
}
