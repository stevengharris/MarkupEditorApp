/** We need to import defineConfig because we're not using vite. */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Redirects 'markupeditor' imports to the exact bundle the real app loads at
// runtime (MarkupEditor/Resources/markup-editor.js), not whatever version
// happens to be installed under node_modules/markupeditor -- that can drift
// out of sync with what's actually shipped (verified: the installed copy here
// was two versions behind Resources, missing recently-added functionality).
export default defineConfig({
  resolve: {
    alias: {
      markupeditor: path.resolve(import.meta.dirname, '../../MarkupEditor/MarkupEditor/Resources/markup-editor.js'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './test/vitest.setup.js'
  },
})
