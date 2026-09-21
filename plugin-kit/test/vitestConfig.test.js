import { describe, it, expect, vi, afterEach } from 'vitest'
import fs from 'node:fs'
import { pluginVitestConfig } from '../src/testing/vitestConfig.js'
import { BUILD_DIST, JSDOM_SHIMS, SHIPPED_BUNDLE, STUB } from '../src/testing/paths.js'

afterEach(() => vi.restoreAllMocks())

describe('pluginVitestConfig', () => {
    it('defaults to the shared jsdom shims as the only setup file, with no environment, global setup or alias', () => {
        const config = pluginVitestConfig()
        expect(config.test.setupFiles).toEqual([JSDOM_SHIMS])
        expect(config.test.environment).toBeUndefined()
        expect(config.test.globalSetup).toBeUndefined()
        expect(config.resolve.alias).toEqual({})
    })

    it('passes an environment through', () => {
        expect(pluginVitestConfig({ environment: 'jsdom' }).test.environment).toBe('jsdom')
    })

    it('dist: true rebuilds the dist before tests and aliases the built bundle\'s relative editor import to the stub', () => {
        const config = pluginVitestConfig({ dist: true })
        expect(config.test.globalSetup).toEqual([BUILD_DIST])
        expect(config.resolve.alias['./markup-editor.js']).toBe(STUB)
    })

    it('shippedBundle: true aliases markupeditor to the app\'s bundle when that file exists', () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(true)
        expect(pluginVitestConfig({ shippedBundle: true }).resolve.alias.markupeditor).toBe(SHIPPED_BUNDLE)
    })

    it('shippedBundle: true leaves markupeditor unaliased when the sibling MarkupEditor checkout is absent', () => {
        vi.spyOn(fs, 'existsSync').mockReturnValue(false)
        expect(pluginVitestConfig({ shippedBundle: true }).resolve.alias.markupeditor).toBeUndefined()
    })

    it('leaves markupeditor unaliased unless asked', () => {
        expect(pluginVitestConfig({ dist: true }).resolve.alias.markupeditor).toBeUndefined()
    })
})
