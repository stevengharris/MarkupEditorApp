import { readFileSync, realpathSync } from 'node:fs'
import path from 'node:path'
import commonjs from '@rollup/plugin-commonjs'
import resolve from '@rollup/plugin-node-resolve'
import css from 'rollup-plugin-import-css'
import { pluginBanner, validateMarkupEditorBlock } from './manifest.js'

// Already bundled inside markup-editor.js and re-exported from there. Declaring them external
// prevents duplicate copies in a plugin bundle; ProseMirror uses instanceof checks internally,
// so a second copy of e.g. Decoration wouldn't satisfy checks against the shared EditorView's.
const PROSEMIRROR = ['prosemirror-model', 'prosemirror-state', 'prosemirror-view']

// Serves an imported package.json as just its `markupeditor` block, so the built file carries
// the identity without the rest of the manifest (author, dependencies, scripts).
function trimmedPackageJson(file, block) {
    return {
        name: 'plugin-kit-trimmed-package-json',
        load(id) {
            if (id === file) return `export default ${JSON.stringify({ markupeditor: block })}`
        },
    }
}

// Rollup config for a plugin at `dir`, built from its package.json:
//   input    entry file, relative to `dir`.
//   plugins  extra rollup plugins, appended after the shared ones.
// The output path is `main`, and the first line of the built file is the identity banner. The
// `paths` rewrite points every external at the relative URL the app's editor bundle shares with
// plugins at runtime (they land in the same WKWebView cache directory).
export function pluginConfig(dir, { input, plugins = [] }) {
    const label = `Plugin "${path.basename(dir)}"`
    const packageJson = path.join(dir, 'package.json')
    const pkg = JSON.parse(readFileSync(packageJson, 'utf8'))
    const block = validateMarkupEditorBlock(pkg.markupeditor, label)
    if (typeof pkg.main !== 'string' || !pkg.main) throw new Error(`${label}: package.json is missing "main"`)

    const isCodeview = block.type === 'codeview'
    const external = isCodeview ? [...PROSEMIRROR, 'markupeditor'] : ['markupeditor']
    return {
        input: path.resolve(dir, input),
        external,
        output: {
            file: path.resolve(dir, pkg.main),
            format: 'es',
            inlineDynamicImports: true,
            banner: pluginBanner(block),
            paths: Object.fromEntries(external.map((name) => [name, './markup-editor.js'])),
        },
        plugins: [
            trimmedPackageJson(realpathSync(packageJson), block),
            resolve(isCodeview ? {} : { browser: true, preferBuiltins: false }),
            commonjs(),
            ...(isCodeview ? [css()] : []),
            ...plugins,
        ],
    }
}
