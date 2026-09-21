import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { pluginDirOf } from '../src/testing/buildDist.js'

describe('pluginDirOf', () => {
    it('is the directory holding the vitest config file, not the process working directory', () => {
        const project = { vite: { config: { configFile: '/repo/plugins/x/vitest.config.js' } }, config: { root: '/repo' } }
        expect(pluginDirOf(project)).toBe(path.normalize('/repo/plugins/x'))
    })

    it('falls back to the project root when there is no config file', () => {
        expect(pluginDirOf({ vite: { config: {} }, config: { root: '/repo/plugins/y' } })).toBe('/repo/plugins/y')
        expect(pluginDirOf({ config: { root: '/repo/plugins/y' } })).toBe('/repo/plugins/y')
    })
})
