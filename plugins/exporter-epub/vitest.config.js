/** We need to import defineConfig because we're not using vite. */
import { defineConfig } from 'vitest/config'
import fs from 'node:fs'
import path from 'node:path'

// The bundle the real app loads lives in the sibling MarkupEditor checkout. Without that
// checkout the alias is omitted and 'markupeditor' resolves to the installed npm package.
const shippedBundle = path.resolve(import.meta.dirname, '../../../MarkupEditor/MarkupEditor/Resources/markup-editor.js')

export default defineConfig({
  test: {
    setupFiles: './test/vitest.setup.js',
    // Rebuilds dist/ before any test runs, regardless of entry point (npm test, bare `vitest
    // run`, watch mode) -- unlike npm's `pretest` lifecycle hook, which only fires for `npm
    // test`. Tier-2/3 tests import the real built dist/exporter-epub.js, not src/; testing a
    // stale dist as if fresh would be worse than not testing it at all.
    globalSetup: './test/globalSetup.js'
  },
  resolve: {
    alias: {
      // Points the bare 'markupeditor' specifier at the exact bundle the real app loads at
      // runtime, rather than whichever npm package happens to be installed nearby -- see
      // plugins/README.md's Testing section for why this matters for the fidelity tier.
      ...(fs.existsSync(shippedBundle) && { markupeditor: shippedBundle }),
      // rollup's `paths` config (rollup.config.mjs) rewrites the built dist/exporter-epub.js's
      // `import { MU } from "markupeditor"` to a relative `./markup-editor.js` -- there's no
      // real file there in this repo (the app copies one in at runtime), so tests that import
      // dist/ directly need a stand-in. Vite's alias matching is against the literal specifier
      // text as written (`./markup-editor.js`), not a pre-resolved absolute path -- keying by
      // an absolute path here silently never matches.
      './markup-editor.js': path.resolve(import.meta.dirname, 'test/helpers/markup-editor-stub.js')
    }
  }
})
