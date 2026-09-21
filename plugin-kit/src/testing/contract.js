import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { parsePluginBanner, pluginBanner } from '../manifest.js'
import { MU } from './markup-editor-stub.js'

function identityOf(block) {
    return JSON.parse(pluginBanner(block).slice('/*! markupeditor-plugin '.length, -' */'.length))
}

// Everything wrong between a built plugin and its package.json; empty when they agree.
//   block, packageJson   the plugin's package.json `markupeditor` block and whole manifest
//   source               the built dist's text
//   registrations        the MU.registerPlugin argument lists captured while loading the dist
//   registersAtLoad      whether loading the dist is expected to register. Exporters do;
//                        codeviews register from install() against a live editor view, which a
//                        stub cannot provide, so only their banner and contents are checked.
export function registrationProblems({ block, packageJson, source, registrations, registersAtLoad }) {
    const problems = []
    const identity = identityOf(block)

    try {
        const banner = parsePluginBanner(source)
        if (!banner) problems.push('the dist does not start with a plugin banner')
        else if (JSON.stringify(banner) !== JSON.stringify(identity)) {
            problems.push(`banner ${JSON.stringify(banner)} does not match package.json ${JSON.stringify(identity)}`)
        }
    } catch (error) {
        problems.push(`the dist banner is invalid: ${error.message}`)
    }

    if (registersAtLoad) {
        if (registrations.length !== 1) {
            problems.push(`expected exactly one MU.registerPlugin call at load, got ${registrations.length}`)
        } else {
            const [plugin, ...rest] = registrations[0]
            for (const key of ['name', 'type', 'ext']) {
                if (key === 'ext' && block.type !== 'exporter') continue
                if (plugin[key] !== block[key]) {
                    problems.push(`registered ${key} ${JSON.stringify(plugin[key])} does not match package.json ${JSON.stringify(block[key])}`)
                }
            }
            if ('filename' in plugin) problems.push('registration has a filename property, which duplicates the real file name')
            if (rest.length > 0) problems.push('registerPlugin was given a second (name) argument')
            for (const [key, value] of Object.entries(plugin)) {
                if (typeof value !== 'string' && typeof value !== 'function') {
                    problems.push(`registration value "${key}" is neither a string nor a function`)
                }
            }
            if (block.type === 'exporter' && typeof plugin.run !== 'function') {
                problems.push('exporter registration has no run function')
            }
        }
    }

    // The kit's register functions hold the only MU.registerPlugin call; a second one is a
    // hand-typed registration. Internal plugins register nothing.
    const expectedSites = block.internal ? 0 : 1
    const sites = (source.match(/\bMU\.registerPlugin\(/g) ?? []).length
    if (sites !== expectedSites) {
        problems.push(`expected ${expectedSites} MU.registerPlugin call site${expectedSites === 1 ? '' : 's'} in the dist, found ${sites}; register through the kit's register functions`)
    }

    // Only fields distinctive enough not to appear in bundled libraries.
    for (const field of ['author', 'description']) {
        if (packageJson[field] && source.includes(packageJson[field])) {
            problems.push(`the dist contains the package.json ${field}`)
        }
    }
    return problems
}

// Loads the built dist of the plugin at `pluginDir` against the stub `MU` and returns its
// registrationProblems. The dist must be rebuilt first (pluginVitestConfig({ dist: true })).
// Exporter dists are loaded, so call this under jsdom.
export async function checkPlugin(pluginDir) {
    const packageJson = JSON.parse(readFileSync(path.join(pluginDir, 'package.json'), 'utf8'))
    const block = packageJson.markupeditor
    const distPath = path.resolve(pluginDir, packageJson.main)
    const registrations = []
    const registersAtLoad = block.type === 'exporter'
    if (registersAtLoad) {
        MU.registerPlugin = (...args) => registrations.push(args)
        await import(distPath)
    }
    const source = readFileSync(distPath, 'utf8')
    return registrationProblems({ block, packageJson, source, registrations, registersAtLoad })
}

// Defines the contract test for the plugin at `pluginDir`: its built dist must carry a banner
// and no untrimmed package.json content, register only through the kit, and (exporters) register
// exactly what package.json says. Call from a test file in the plugin's suite.
export function registrationContract(pluginDir) {
    describe(`${path.basename(pluginDir)}: built dist against package.json`, () => {
        it('has a matching banner and registration and no untrimmed package.json content', async () => {
            expect(await checkPlugin(pluginDir)).toEqual([])
        })
    })
}
