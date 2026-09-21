import { describe, it, expect, vi, beforeEach } from 'vitest'
import { MU } from '../src/testing/markup-editor-stub.js'
import { registerCodeView, registerExporter, registerPlugin } from '../src/register.js'

const EXPORTER = { name: 'EPUB', type: 'exporter', ext: 'epub' }
const CODEVIEW = { name: 'Mermaid', type: 'codeview' }

let calls
beforeEach(() => {
    calls = []
    MU.registerPlugin = vi.fn((...args) => calls.push(args))
})

describe('registerExporter', () => {
    it('registers name, type and ext from the block plus the run callback, with no filename and no second argument', () => {
        const run = () => '{}'
        registerExporter(EXPORTER, { run })
        expect(calls).toEqual([[{ name: 'EPUB', type: 'exporter', ext: 'epub', run }]])
        expect(calls[0][0]).not.toHaveProperty('filename')
    })

    it('requires a run function', () => {
        expect(() => registerExporter(EXPORTER, {})).toThrow('registerExporter: run must be a function')
        expect(calls).toEqual([])
    })

    it('rejects a block whose type is not exporter', () => {
        expect(() => registerExporter(CODEVIEW, { run() {} })).toThrow('registerExporter: markupeditor.type is "codeview", expected "exporter"')
    })

    it('rejects an invalid block, naming the caller', () => {
        expect(() => registerExporter({ name: 'X', type: 'exporter' }, { run() {} })).toThrow('registerExporter: markupeditor.ext is required')
    })
})

describe('registerCodeView', () => {
    it('registers name and type only, with no ext', () => {
        registerCodeView(CODEVIEW)
        expect(calls).toEqual([[{ name: 'Mermaid', type: 'codeview' }]])
    })

    it('rejects a block whose type is not codeview', () => {
        expect(() => registerCodeView(EXPORTER)).toThrow('registerCodeView: markupeditor.type is "exporter", expected "codeview"')
    })
})

describe('registerPlugin', () => {
    it('registers either type, taking the type from the block', () => {
        registerPlugin(CODEVIEW)
        registerPlugin(EXPORTER, { run() {} })
        expect(calls.map(([plugin]) => plugin.type)).toEqual(['codeview', 'exporter'])
    })
})

describe('members', () => {
    it.each(['name', 'type', 'ext', 'filename'])('may not set %s, which comes from package.json', (key) => {
        expect(() => registerPlugin(CODEVIEW, { [key]: 'x' })).toThrow(`${key} comes from package.json`)
        expect(calls).toEqual([])
    })

    it('allows functions but rejects other non-string values, since the host reads registrations as string maps', () => {
        expect(() => registerPlugin(CODEVIEW, { run() {}, label: 'ok' })).not.toThrow()
        expect(() => registerPlugin(CODEVIEW, { count: 3 })).toThrow('count must be a string or a function')
        expect(() => registerPlugin(CODEVIEW, { flag: true })).toThrow('flag must be a string or a function')
    })
})
