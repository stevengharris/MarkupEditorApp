import { describe, it, expect } from 'vitest'
import { parsePluginBanner, pluginBanner, validateMarkupEditorBlock } from '../src/manifest.js'

const EXPORTER = { name: 'EPUB', type: 'exporter', ext: 'epub' }
const CODEVIEW = { name: 'Mermaid', type: 'codeview' }

describe('validateMarkupEditorBlock', () => {
    it('returns a valid exporter block, and a valid codeview block without ext', () => {
        expect(validateMarkupEditorBlock(EXPORTER, 'Plugin "x"')).toBe(EXPORTER)
        expect(validateMarkupEditorBlock(CODEVIEW, 'Plugin "x"')).toBe(CODEVIEW)
    })

    it.each([
        [undefined, 'package.json is missing the "markupeditor" object'],
        ['text', 'package.json is missing the "markupeditor" object'],
        [{ type: 'codeview' }, 'markupeditor.name is missing'],
        [{ name: 3, type: 'codeview' }, 'markupeditor.name must be a string, got number'],
        [{ name: 'X' }, 'markupeditor.type is missing'],
        [{ name: 'X', type: 'importer' }, 'markupeditor.type must be "exporter" or "codeview", got "importer"'],
        [{ name: 'X', type: 'exporter' }, 'markupeditor.ext is required when type is "exporter"'],
        [{ name: 'X', type: 'exporter', ext: 7 }, 'markupeditor.ext must be a string, got number'],
        [{ name: 'X', type: 'exporter', ext: '.epub' }, 'markupeditor.ext must not have a leading dot, got ".epub"'],
        [{ name: 'A*/b', type: 'codeview' }, 'markupeditor.name must not contain "*/"'],
        [{ name: 'X', type: 'exporter', ext: 'a*/b' }, 'markupeditor.ext must not contain "*/"'],
    ])('rejects %j with the label and a specific message', (block, message) => {
        expect(() => validateMarkupEditorBlock(block, 'Plugin "x"')).toThrow(`Plugin "x": ${message}`)
    })
})

describe('pluginBanner', () => {
    it('is a preserved-comment JSON line with name, type and ext for an exporter', () => {
        expect(pluginBanner(EXPORTER)).toBe('/*! markupeditor-plugin {"name":"EPUB","type":"exporter","ext":"epub"} */')
    })

    it('omits ext for a codeview, even when the block carries one', () => {
        expect(pluginBanner(CODEVIEW)).toBe('/*! markupeditor-plugin {"name":"Mermaid","type":"codeview"} */')
        expect(pluginBanner({ ...CODEVIEW, ext: 'x' })).toBe('/*! markupeditor-plugin {"name":"Mermaid","type":"codeview"} */')
    })

    it('refuses an identity containing */, which would end the comment early', () => {
        expect(() => pluginBanner({ name: 'A*/ alert(1); /*B', type: 'codeview' })).toThrow('would end the comment')
    })

    it('carries no other block fields (the internal flag stays out of the dist)', () => {
        expect(pluginBanner({ ...CODEVIEW, internal: true })).not.toContain('internal')
    })
})

describe('parsePluginBanner', () => {
    it('reads back what pluginBanner wrote, from the first line of a source file', () => {
        expect(parsePluginBanner(`${pluginBanner(EXPORTER)}\nconsole.log(1)\n`)).toEqual(EXPORTER)
        expect(parsePluginBanner(`${pluginBanner(CODEVIEW)}\n`)).toEqual(CODEVIEW)
    })

    it('tolerates CRLF line endings, a leading BOM and trailing whitespace on the banner line', () => {
        const banner = pluginBanner(EXPORTER)
        expect(parsePluginBanner(`${banner}\r\nconsole.log(1)\r\n`)).toEqual(EXPORTER)
        expect(parsePluginBanner(`\uFEFF${banner}\n`)).toEqual(EXPORTER)
        expect(parsePluginBanner(`${banner}  \t\n`)).toEqual(EXPORTER)
    })

    it('reads a name containing a Unicode line separator', () => {
        const block = { name: 'A\u2028B', type: 'codeview' }
        expect(parsePluginBanner(`${pluginBanner(block)}\n`)).toEqual(block)
    })

    it('returns null when the first line is not a banner, even if a later line is', () => {
        expect(parsePluginBanner('console.log(1)\n')).toBeNull()
        expect(parsePluginBanner(`\n${pluginBanner(EXPORTER)}\n`)).toBeNull()
        expect(parsePluginBanner('')).toBeNull()
    })

    it('throws on a banner whose JSON is malformed or whose block is invalid', () => {
        expect(() => parsePluginBanner('/*! markupeditor-plugin {oops} */\n')).toThrow('banner')
        expect(() => parsePluginBanner('/*! markupeditor-plugin {"name":"X","type":"exporter"} */\n')).toThrow('markupeditor.ext is required')
    })
})
