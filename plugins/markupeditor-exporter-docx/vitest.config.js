/** We need to import defineConfig because we're not using vite. */
import { defineConfig } from 'vitest/config'
import path from 'node:path'

// Redirects every 'markupeditor' import (including transitive ones -- e.g.
// markupeditor-app/src/markdown.js's own `import { MU } from "markupeditor"`,
// reached via test/helpers/renderTestDocument.js) to the exact bundle the real
// app loads at runtime (MarkupEditor/Resources/markup-editor.js), not whatever
// version happens to be installed under some package's own node_modules --
// those can drift out of sync with what's actually shipped. A Vite-level
// resolve.alias applies across the whole module graph regardless of which
// file does the importing, unlike per-file resolution or vi.mock (which only
// intercepts a specifier resolved from the mocking file's own location).
export default defineConfig({
  resolve: {
    alias: {
      markupeditor: path.resolve(import.meta.dirname, '../../../MarkupEditor/MarkupEditor/Resources/markup-editor.js'),
    },
  },
  test: {
    setupFiles: './test/vitest.setup.js'
  }
})
