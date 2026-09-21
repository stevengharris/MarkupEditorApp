import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { NPM_BUNDLE, SHIPPED_BUNDLE } from '../src/testing/paths.js'

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

// Every plugin resolves `markupeditor` to the one hoisted package, so this is checked once for
// the workspace rather than per plugin.
describe('the npm markupeditor dependency vs. the bundle MarkupEditorApp actually ships', () => {
  it.skipIf(!existsSync(SHIPPED_BUNDLE))('hash-match, so plugin tests exercise the same editor build the app ships', () => {
    expect(sha256(NPM_BUNDLE)).toBe(sha256(SHIPPED_BUNDLE))
  })
})
