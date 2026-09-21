import { MU } from 'markupeditor'
import { validateMarkupEditorBlock } from './manifest.js'

// Identity comes from package.json's `markupeditor` block, so plugin source never types it:
//
//   import pkg from '../package.json' with { type: 'json' }
//   registerExporter(pkg.markupeditor, { run })
//
// `MU.runPlugin(name)` looks a plugin up by exact name and returns null on a miss, so the
// registered name has to be the one the host recorded from that same block.
const FROM_PACKAGE_JSON = ['name', 'type', 'ext', 'filename']

function register(block, type, members, caller) {
    validateMarkupEditorBlock(block, caller)
    if (type && block.type !== type) {
        throw new Error(`${caller}: markupeditor.type is "${block.type}", expected "${type}"`)
    }
    for (const [key, value] of Object.entries(members)) {
        if (FROM_PACKAGE_JSON.includes(key)) throw new Error(`${caller}: ${key} comes from package.json`)
        // The host reads the registrations it is sent as string maps (functions are dropped in
        // transit); any other value type makes it discard the whole list.
        if (typeof value !== 'string' && typeof value !== 'function') {
            throw new Error(`${caller}: ${key} must be a string or a function`)
        }
    }
    const plugin = { name: block.name, type: block.type, ...(block.type === 'exporter' && { ext: block.ext }), ...members }
    MU.registerPlugin(plugin)
    return plugin
}

export function registerPlugin(block, members = {}) {
    return register(block, null, members, 'registerPlugin')
}

export function registerExporter(block, members) {
    if (typeof members?.run !== 'function') throw new Error('registerExporter: run must be a function')
    return register(block, 'exporter', members, 'registerExporter')
}

export function registerCodeView(block, members = {}) {
    return register(block, 'codeview', members, 'registerCodeView')
}
