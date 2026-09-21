import path from 'node:path'

const testingDir = import.meta.dirname

export const REPO_ROOT = path.resolve(testingDir, '../../..')

// The npm-installed editor bundle every plugin resolves `markupeditor` to (hoisted to the root).
export const NPM_BUNDLE = path.join(REPO_ROOT, 'node_modules/markupeditor/dist/markup-editor.js')

// The bundle the app ships, in the sibling MarkupEditor checkout.
export const SHIPPED_BUNDLE = path.resolve(REPO_ROOT, '../MarkupEditor/MarkupEditor/Resources/markup-editor.js')

export const JSDOM_SHIMS = path.join(testingDir, 'jsdomShims.js')
export const BUILD_DIST = path.join(testingDir, 'buildDist.js')
export const STUB = path.join(testingDir, 'markup-editor-stub.js')
