import { describe, it, expect } from 'vitest'

describe('jsdom shims in a plain node test file', () => {
    it('loads without throwing when there is no CSSStyleSheet or document', async () => {
        expect(typeof CSSStyleSheet).toBe('undefined')
        await expect(import('../src/testing/jsdomShims.js')).resolves.toBeDefined()
    })
})
