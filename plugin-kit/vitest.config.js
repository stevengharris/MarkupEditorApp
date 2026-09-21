import { defineConfig } from 'vitest/config'
import { STUB } from './src/testing/paths.js'

// The registration API imports `markupeditor`; the kit's tests run it against the stub `MU`.
export default defineConfig({
    resolve: { alias: { markupeditor: STUB } },
})
