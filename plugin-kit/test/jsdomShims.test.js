// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import '../src/testing/jsdomShims.js'

describe('jsdom shims for the real markupeditor bundle', () => {
    it('adds CSSStyleSheet.replaceSync, which stores the text', () => {
        const sheet = new CSSStyleSheet()
        expect(sheet.replaceSync('a { color: red }')).toBe('a { color: red }')
        expect(sheet.cssText).toBe('a { color: red }')
    })

    it('adds a writable CSSStyleSheet.media with a mediaText', () => {
        const sheet = new CSSStyleSheet()
        expect(() => { sheet.media.mediaText = 'x' }).not.toThrow()
    })

    it('makes document.execCommand a callable no-op', () => {
        expect(() => document.execCommand('bold')).not.toThrow()
    })

    it('gives document an empty, spreadable adoptedStyleSheets array', () => {
        expect([...document.adoptedStyleSheets]).toEqual([])
    })
})
