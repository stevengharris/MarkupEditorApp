const METADATA_LANGUAGE = 'metadata'

// Mirrors plugins/codeview-metadata/src/metadataview.js's isMetadataLanguage check
// (case-insensitive, trimmed) -- reimplemented since that plugin isn't a dependency here.
function isMetadataLanguage(language) {
    return (language ?? '').trim().toLowerCase() === METADATA_LANGUAGE
}

// Strips quotes and unescapes a scalar token, as YAMLMetadata.parseScalar (Swift) does.
function parseScalar(token) {
    if (token.length >= 2 && token.startsWith('"') && token.endsWith('"')) {
        return token.slice(1, -1).replace(/\\(["\\])/g, '$1')
    }
    if (token.length >= 2 && token.startsWith("'") && token.endsWith("'")) {
        return token.slice(1, -1).replace(/''/g, "'")
    }
    return token
}

// Splits a flow sequence (`[a, "b, c", d]`) on commas outside quotes. A quote only opens at
// the start of an item, so an apostrophe inside a bare word ("don't") is literal.
function parseFlowSequence(text) {
    let inner = text.trim()
    if (inner.startsWith('[')) inner = inner.slice(1)
    if (inner.endsWith(']')) inner = inner.slice(0, -1)
    const items = []
    let current = ''
    let quote = null
    for (let i = 0; i < inner.length; i++) {
        const ch = inner[i]
        if (quote) {
            current += ch
            if (quote === '"' && ch === '\\' && i + 1 < inner.length) current += inner[++i]
            else if (ch === quote) quote = null
        } else if ((ch === '"' || ch === "'") && current.trim() === '') {
            quote = ch
            current += ch
        } else if (ch === ',') {
            items.push(parseScalar(current.trim()))
            current = ''
        } else {
            current += ch
        }
    }
    if (current.trim()) items.push(parseScalar(current.trim()))
    return items
}

// Best-effort frontmatter parser for the constructs YAMLMetadata.parse (Swift) handles: scalar
// values (quotes stripped, escapes undone), flow sequences ("key: [a, b]") and block sequences
// ("key:" followed by "- item" lines). A scalar comes back as a string, a sequence as a string
// array. Not a full YAML parser, and not a round-trip: only reads values back out for export.
function parseMetadataLines(text) {
    const values = {}
    const lines = (text ?? '').split('\n')
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (!line || line.startsWith('#') || line === '---') continue
        if (line.endsWith(': |') || line.endsWith(': >')) continue
        const match = line.match(/^([^:\s][^:]*):\s?(.*)$/)
        if (!match) continue
        // Lowercased -- the metadata.title/.language/.identifier lookups here and opf.js's
        // RESERVED_KEYS exclusion both match a fixed lowercase name. A user-typed "Title:"
        // would otherwise both miss the title-override logic and slip past RESERVED_KEYS into
        // the Dublin Core sweep, producing a stray, wrong-cased <dc:Title> alongside the real
        // <dc:title>.
        const key = match[1].trim().toLowerCase()
        const rawValue = match[2].trim()
        if (rawValue === '') {
            const items = []
            let j = i + 1
            while (j < lines.length) {
                const next = lines[j].trim()
                if (next.startsWith('- ')) items.push(parseScalar(next.slice(2).trim()))
                else if (next !== '') break
                j++
            }
            if (items.length) {
                values[key] = items
                i = j - 1
            } else {
                values[key] = ''
            }
        } else if (rawValue.startsWith('[')) {
            values[key] = parseFlowSequence(rawValue)
        } else {
            values[key] = parseScalar(rawValue)
        }
    }
    return values
}

// The document's YAML frontmatter is seeded into the live ProseMirror document as a code_block
// at position 0 (MarkupDocument.seedMetadataBlock, Swift-side) whenever metadata is non-empty.
// MU.activeView() is the only way to reach the document model (creator, etc. as structured
// data). Returns {} when there's no metadata block or no active view.
export function extractMetadata(MU) {
    const view = MU.activeView?.()
    const first = view?.state?.doc?.firstChild
    if (!first || first.type?.name !== 'code_block' || !isMetadataLanguage(first.attrs?.language)) return {}
    return parseMetadataLines(first.textContent)
}

// A sequence value comes back as its items; a scalar as a single-element array; an
// absent/empty value as an empty array. A quoted scalar that merely looks like a list
// (`"[x]"`) stays literal.
export function parseMetadataList(value) {
    if (Array.isArray(value)) return value.filter(Boolean)
    if (!value) return []
    return [value]
}

// The string form of a value that is expected to be a scalar (title, language, ...); a sequence
// written there is joined instead of reaching an XML/document writer as an array.
export function metadataScalar(value) {
    return Array.isArray(value) ? value.join(', ') : (value ?? '')
}

// MU.getHTML()'s output, unlike the markdown serializer (markupeditor-app/src/serializer.js's
// code_block handler), has no awareness of the metadata convention -- the base editor's
// generic DOMSerializer renders the position-0 metadata code_block exactly like any other
// <pre><code class="language-X">, so it leaks into export output unless stripped here. Mirrors
// serializer.js's rule (doc-root index 0, language "metadata") at the HTML-string level, since
// that's all getHTML() gives a plugin. Metadata is data about the document, not part of it.
export function stripMetadataBlock(html) {
    return (html ?? '').replace(/^\s*<pre><code class="language-metadata">[\s\S]*?<\/code><\/pre>\s*/, '')
}
