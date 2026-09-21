import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rollup } from 'rollup'
import { pluginConfig } from '../src/rollup.js'
import { parsePluginBanner } from '../src/manifest.js'

const dirs = []
afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const EXPORTER_PKG = {
    name: 'exporter-fixture',
    main: 'dist/exporter-fixture.js',
    author: 'Some Author <some@author.example>',
    scripts: { build: 'rollup -c' },
    devDependencies: { vitest: '^3.2.4' },
    markupeditor: { name: 'Fixture', type: 'exporter', ext: 'fix' },
}

const SOURCE = `
import { MU } from 'markupeditor'
import pkg from '../package.json' with { type: 'json' }
MU.registerPlugin({ name: pkg.markupeditor.name })
`

async function fixture(pkg, source = SOURCE) {
    const dir = await mkdtemp(path.join(tmpdir(), 'plugin-kit-rollup-'))
    dirs.push(dir)
    await mkdir(path.join(dir, 'src'))
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(pkg))
    await writeFile(path.join(dir, 'src/index.js'), source)
    return dir
}

async function build(dir, options = {}) {
    const config = pluginConfig(dir, { input: 'src/index.js', ...options })
    const bundle = await rollup(config)
    const { output } = await bundle.generate(config.output)
    await bundle.close()
    return { config, code: output[0].code }
}

describe('pluginConfig', () => {
    it('writes to the package.json main path, independent of the working directory', async () => {
        const dir = await fixture(EXPORTER_PKG)
        expect(pluginConfig(dir, { input: 'src/index.js' }).output.file).toBe(path.join(dir, 'dist/exporter-fixture.js'))
    })

    it('starts the built file with a banner that parses back to the plugin identity', async () => {
        const { code } = await build(await fixture(EXPORTER_PKG))
        expect(code.split('\n')[0]).toMatch(/^\/\*! markupeditor-plugin /)
        expect(parsePluginBanner(code)).toEqual({ name: 'Fixture', type: 'exporter', ext: 'fix' })
    })

    it('inlines an imported package.json trimmed to the markupeditor block, even when the whole object is used', async () => {
        // Passing the whole object keeps rollup from tree-shaking the unused properties away, so
        // only the trim itself keeps them out of the built file.
        const wholeObject = `import { MU } from 'markupeditor'\nimport pkg from '../package.json' with { type: 'json' }\nMU.registerPlugin(pkg)\n`
        const { code } = await build(await fixture(EXPORTER_PKG, wholeObject))
        expect(code).toContain('"Fixture"')
        for (const leaked of ['some@author.example', 'devDependencies', 'rollup -c', 'exporter-fixture']) {
            expect(code).not.toContain(leaked)
        }
    })

    it('rewrites the bare markupeditor import to the relative bundle both files share at runtime', async () => {
        const { code } = await build(await fixture(EXPORTER_PKG))
        expect(code).toMatch(/from ['"]\.\/markup-editor\.js['"]/)
        expect(code).not.toMatch(/from ['"]markupeditor['"]/)
    })

    it('externalizes ProseMirror for a codeview so the editor\'s single copy is shared', async () => {
        const pkg = { ...EXPORTER_PKG, markupeditor: { name: 'View', type: 'codeview' } }
        const source = `import { Decoration } from 'prosemirror-view'\nexport const d = Decoration\n`
        const { code } = await build(await fixture(pkg, source))
        expect(code).toMatch(/from ['"]\.\/markup-editor\.js['"]/)
        expect(code).not.toMatch(/from ['"]prosemirror-view['"]/)
        expect(parsePluginBanner(code)).toEqual({ name: 'View', type: 'codeview' })
    })

    it('does not externalize ProseMirror for an exporter', () => {
        return fixture(EXPORTER_PKG).then((dir) => {
            expect(pluginConfig(dir, { input: 'src/index.js' }).external).toEqual(['markupeditor'])
        })
    })

    it('stamps a banner on an internal plugin too, without leaking the internal flag', async () => {
        const pkg = { ...EXPORTER_PKG, markupeditor: { name: 'Meta', type: 'codeview', internal: true } }
        const { code } = await build(await fixture(pkg))
        expect(parsePluginBanner(code)).toEqual({ name: 'Meta', type: 'codeview' })
        expect(code.split('\n')[0]).not.toContain('internal')
    })

    it('appends the rollup plugins a plugin passes after the shared ones', async () => {
        const extra = { name: 'extra' }
        const dir = await fixture(EXPORTER_PKG)
        const plugins = pluginConfig(dir, { input: 'src/index.js', plugins: [extra] }).plugins
        expect(plugins.at(-1)).toBe(extra)
    })

    it('fails fast when package.json has no main', async () => {
        const { main, ...withoutMain } = EXPORTER_PKG
        const dir = await fixture(withoutMain)
        expect(() => pluginConfig(dir, { input: 'src/index.js' })).toThrow('package.json is missing "main"')
    })

    it('fails fast, naming the plugin directory, when the markupeditor block is invalid', async () => {
        const dir = await fixture({ ...EXPORTER_PKG, markupeditor: { name: 'X', type: 'exporter' } })
        expect(() => pluginConfig(dir, { input: 'src/index.js' })).toThrow(`${path.basename(dir)}`)
        expect(() => pluginConfig(dir, { input: 'src/index.js' })).toThrow('markupeditor.ext is required')
    })
})
