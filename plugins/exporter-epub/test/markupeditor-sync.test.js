import { describe, it, expect } from 'vitest'
import { readFileSync, existsSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

const npmBundlePath = path.resolve(import.meta.dirname, '../../../node_modules/markupeditor/dist/markup-editor.js')
const appBundlePath = path.resolve(import.meta.dirname, '../../../../MarkupEditor/MarkupEditor/Resources/markup-editor.js')
const appBundleExists = existsSync(appBundlePath)

describe('the npm markupeditor dependency vs. the bundle MarkupEditorApp actually ships', () => {
  it.skipIf(!appBundleExists)('hash-match, so this plugin\'s tests exercise the same editor build the app ships', () => {
    expect(sha256(npmBundlePath)).toBe(sha256(appBundlePath))
  })
})
