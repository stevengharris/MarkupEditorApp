import { describe, it, expect, afterEach } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { rollup } from 'rollup'
import { pluginConfig } from '../src/rollup.js'
import { checkPlugin } from '../src/testing/contract.js'

const REGISTER = path.resolve(import.meta.dirname, '../src/register.js')
const dirs = []
afterEach(async () => {
    await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })))
})

const PKG = {
    name: 'exporter-fixture',
    main: 'dist/exporter-fixture.js',
    author: 'Some Author <some@author.example>',
    markupeditor: { name: 'Fixture', type: 'exporter', ext: 'fix' },
}

// Builds a real plugin dist from `source` and returns its directory.
async function builtPlugin(source) {
    const dir = await mkdtemp(path.join(tmpdir(), 'plugin-kit-contract-'))
    dirs.push(dir)
    await mkdir(path.join(dir, 'src'))
    await writeFile(path.join(dir, 'package.json'), JSON.stringify(PKG))
    await writeFile(path.join(dir, 'src/index.js'), source)
    const config = pluginConfig(dir, { input: 'src/index.js' })
    const bundle = await rollup(config)
    await bundle.write(config.output)
    await bundle.close()
    return dir
}

const REGISTERED_THROUGH_THE_KIT = `
import pkg from '../package.json' with { type: 'json' }
import { registerExporter } from ${JSON.stringify(REGISTER)}
registerExporter(pkg.markupeditor, { run: () => '{}' })
`

describe('checkPlugin, end to end on a built dist', () => {
    it('finds nothing wrong with a plugin registered through the kit', async () => {
        expect(await checkPlugin(await builtPlugin(REGISTERED_THROUGH_THE_KIT))).toEqual([])
    })

    it('catches a hand-typed registration whose name differs from package.json', async () => {
        const source = `
import { MU } from 'markupeditor'
MU.registerPlugin({ name: 'fixture', type: 'exporter', run: () => '{}' }, 'fixture')
`
        const problems = await checkPlugin(await builtPlugin(source))
        expect(problems).toContain('registered name "fixture" does not match package.json "Fixture"')
        expect(problems).toContain('registerPlugin was given a second (name) argument')
    })

    it('catches a second registration added next to the kit\'s', async () => {
        const source = `${REGISTERED_THROUGH_THE_KIT}
import { MU } from 'markupeditor'
MU.registerPlugin({ name: 'Fixture', type: 'exporter', ext: 'fix', run: () => '{}' })
`
        const problems = await checkPlugin(await builtPlugin(source))
        expect(problems.join('\n')).toContain('expected exactly one MU.registerPlugin call at load, got 2')
        expect(problems.join('\n')).toContain('found 2')
    })
})
