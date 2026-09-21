import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { NPM_BUNDLE, REPO_ROOT } from '../src/testing/paths.js'

// A wrong path here would make the markupeditor sync test skip or misread silently.
describe('testing paths', () => {
    it('REPO_ROOT is the workspace root that lists plugin-kit as a workspace', () => {
        const pkg = JSON.parse(readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8'))
        expect(pkg.workspaces).toContain('plugin-kit')
    })

    it('NPM_BUNDLE is the installed markupeditor bundle', () => {
        expect(existsSync(NPM_BUNDLE)).toBe(true)
    })
})
