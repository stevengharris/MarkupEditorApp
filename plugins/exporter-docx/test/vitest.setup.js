// Guarded: this setup file runs for every test file regardless of its
// @vitest-environment pragma, including plain node (no CSSStyleSheet global).
// Only the test files that load the real `markupeditor` bundle (via
// renderTestDocument.js) need these shims.
if (typeof CSSStyleSheet !== 'undefined') {
  /**
   * Mock `CSSStyleSheet.replaceSync` for jsdom testing.
   */
  if (!('replaceSync' in CSSStyleSheet.prototype)) {
    Object.defineProperty(CSSStyleSheet.prototype, 'replaceSync', {
      value(cssText) {
        this.cssText = cssText
        return cssText
      },
    })
  }

  /**
   * Mock `CSSStyleSheet.media` for jsdom testing. jsdom's CSS Module Script
   * support (`with { type: "css" }`, used by markupeditor-base's main.js for
   * the hljs dark-theme stylesheet) doesn't implement a MediaList, so
   * `hljsDarkStyle.media.mediaText = '...'` throws at module-load time. A
   * plain object with a writable mediaText is enough for that side effect to
   * succeed.
   */
  if (!('media' in CSSStyleSheet.prototype)) {
    Object.defineProperty(CSSStyleSheet.prototype, 'media', {
      value: { mediaText: '' },
      writable: true,
      configurable: true,
    })
  }
}

/**
 * ProseMirror has some hacks to work around access to the Shadow DOM
 * selection on Safari that use document.execCommand, but these are not
 * relevant to testing and can be no-ops.
 */
if (typeof document !== 'undefined' && typeof document.execCommand === 'undefined') {
  document.execCommand = () => {}
}
