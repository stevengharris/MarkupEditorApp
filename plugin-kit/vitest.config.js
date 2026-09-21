import { defineConfig } from 'vitest/config'
import { STUB } from './src/testing/paths.js'

// The registration API imports `markupeditor`, and a built plugin imports the relative
// `./markup-editor.js`; the kit's tests run both against the stub `MU`.
export default defineConfig({
    resolve: { alias: { markupeditor: STUB, './markup-editor.js': STUB } },
})
