import { describe, test, expect } from 'vitest'
import { MarkupEditorDelegate } from '../src/delegate.js'

describe('MarkupEditorDelegate.canStyle/canList', () => {
    test('canStyle(true) (in a table) is false', () => {
        expect(new MarkupEditorDelegate().canStyle(true)).toBe(false)
    })

    test('canStyle(false) (not in a table) is true', () => {
        expect(new MarkupEditorDelegate().canStyle(false)).toBe(true)
    })

    test('canList(true) (in a table) is false', () => {
        expect(new MarkupEditorDelegate().canList(true)).toBe(false)
    })

    test('canList(false) (not in a table) is true', () => {
        expect(new MarkupEditorDelegate().canList(false)).toBe(true)
    })

    test('canInsertHRule(true) (in a table) is false', () => {
        expect(new MarkupEditorDelegate().canInsertHRule(true)).toBe(false)
    })

    test('canInsertHRule(false) (not in a table) is true', () => {
        expect(new MarkupEditorDelegate().canInsertHRule(false)).toBe(true)
    })
})
