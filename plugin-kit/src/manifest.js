const TYPES = new Set(['exporter', 'codeview'])
const BANNER_PREFIX = '/*! markupeditor-plugin '
const BANNER_PATTERN = /^\/\*! markupeditor-plugin (.*) \*\/$/

// Validates a package.json `markupeditor` block and returns it. `label` prefixes every message
// (for example `Plugin "exporter-epub"`) so a failure names the offending plugin.
export function validateMarkupEditorBlock(md, label) {
    if (!md || typeof md !== 'object') {
        throw new Error(`${label}: package.json is missing the "markupeditor" object`)
    }
    if (!md.name) throw new Error(`${label}: markupeditor.name is missing`)
    if (typeof md.name !== 'string') {
        throw new Error(`${label}: markupeditor.name must be a string, got ${typeof md.name}`)
    }
    if (!md.type) throw new Error(`${label}: markupeditor.type is missing`)
    if (!TYPES.has(md.type)) {
        throw new Error(`${label}: markupeditor.type must be "exporter" or "codeview", got "${md.type}"`)
    }
    if (md.type === 'exporter') {
        if (!md.ext) throw new Error(`${label}: markupeditor.ext is required when type is "exporter"`)
        if (typeof md.ext !== 'string') {
            throw new Error(`${label}: markupeditor.ext must be a string, got ${typeof md.ext}`)
        }
        if (md.ext.startsWith('.')) {
            throw new Error(`${label}: markupeditor.ext must not have a leading dot, got "${md.ext}"`)
        }
    }
    return md
}

// The identity a host reads from the first line of a built plugin without executing it: name
// and type, plus ext for an exporter. A preserved (`/*!`) comment, so bundlers keep it.
export function pluginBanner(block) {
    const identity = { name: block.name, type: block.type }
    if (block.type === 'exporter') identity.ext = block.ext
    return `${BANNER_PREFIX}${JSON.stringify(identity)} */`
}

// Reads the banner from the first line of `source`. Returns null when the first line is not a
// banner; throws when it is one but its JSON or identity is invalid.
export function parsePluginBanner(source) {
    const match = source.split('\n', 1)[0].match(BANNER_PATTERN)
    if (!match) return null
    let block
    try {
        block = JSON.parse(match[1])
    } catch (error) {
        throw new Error(`banner: invalid JSON (${error.message})`)
    }
    return validateMarkupEditorBlock(block, 'banner')
}
