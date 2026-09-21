import fs from 'node:fs'
import { defineConfig } from 'vitest/config'
import { BUILD_DIST, JSDOM_SHIMS, SHIPPED_BUNDLE, STUB } from './paths.js'

// Vitest config shared by the plugins.
//
//   environment    Vitest environment for every test file ('jsdom'), or unset for node with
//                  per-file @vitest-environment pragmas.
//   dist           The plugin's tests import its built dist rather than src/. Rebuilds the
//                  dist first, and aliases the built bundle's relative `./markup-editor.js`
//                  import to a stub `MU`. Vite matches aliases against the specifier text as
//                  written, so this is keyed by the literal `./markup-editor.js`, not an
//                  absolute path.
//   shippedBundle  Aliases the bare 'markupeditor' specifier to the exact bundle the app loads
//                  at runtime instead of whichever npm copy is installed. Skipped when the
//                  sibling MarkupEditor checkout is absent, so `markupeditor` then resolves to
//                  the installed package.
export function pluginVitestConfig({ environment, dist = false, shippedBundle = false } = {}) {
    const alias = {}
    if (shippedBundle && fs.existsSync(SHIPPED_BUNDLE)) alias.markupeditor = SHIPPED_BUNDLE
    if (dist) alias['./markup-editor.js'] = STUB
    return defineConfig({
        test: {
            ...(environment && { environment }),
            setupFiles: [JSDOM_SHIMS],
            ...(dist && { globalSetup: [BUILD_DIST] }),
        },
        resolve: { alias },
    })
}
