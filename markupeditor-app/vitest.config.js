/** We need to import defineConfig because we're not using vite. */
import { defineConfig } from 'vitest/config'
import fs from 'node:fs'
import path from 'node:path'

// Redirects 'markupeditor' imports to the bundle the app ships
// (MarkupEditor/Resources/markup-editor.js) when the sibling checkout exists. Otherwise the installed
// npm package is used; CI checks that its version matches the one the app is built with.
const shipped = path.resolve(import.meta.dirname, '../../MarkupEditor/MarkupEditor/Resources/markup-editor.js')

export default defineConfig({
  resolve: {
    alias: fs.existsSync(shipped) ? { markupeditor: shipped } : {},
  },
  test: {
    environment: 'jsdom',
    setupFiles: './test/vitest.setup.js'
  },
})
