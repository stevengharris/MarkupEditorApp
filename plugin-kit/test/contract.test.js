import { describe, it, expect } from 'vitest'
import { registrationProblems } from '../src/testing/contract.js'
import { pluginBanner } from '../src/manifest.js'

const EXPORTER = { name: 'EPUB', type: 'exporter', ext: 'epub' }
const CODEVIEW = { name: 'Mermaid', type: 'codeview' }
const PACKAGE = { author: 'Some Author <some@author.example>', description: 'A fixture plugin for contract tests.' }

function ok(overrides = {}) {
    return {
        block: EXPORTER,
        packageJson: PACKAGE,
        source: `${pluginBanner(EXPORTER)}\nconsole.log('built')\n`,
        registrations: [[{ name: 'EPUB', type: 'exporter', ext: 'epub', run() {} }]],
        registersAtLoad: true,
        ...overrides,
    }
}

describe('registrationProblems', () => {
    it('reports nothing for a dist whose banner and registration both match package.json', () => {
        expect(registrationProblems(ok())).toEqual([])
    })

    it('reports nothing for a codeview, which registers only from install() against a live view', () => {
        const codeview = ok({ block: CODEVIEW, source: `${pluginBanner(CODEVIEW)}\n`, registrations: [], registersAtLoad: false })
        expect(registrationProblems(codeview)).toEqual([])
    })

    it('reports a missing banner', () => {
        expect(registrationProblems(ok({ source: 'console.log(1)\n' }))).toEqual(['the dist does not start with a plugin banner'])
    })

    it('reports a banner that disagrees with package.json', () => {
        const source = `${pluginBanner({ ...EXPORTER, name: 'epub' })}\n`
        expect(registrationProblems(ok({ source }))).toEqual(['banner {"name":"epub","type":"exporter","ext":"epub"} does not match package.json {"name":"EPUB","type":"exporter","ext":"epub"}'])
    })

    it('reports no registration, and more than one', () => {
        expect(registrationProblems(ok({ registrations: [] }))).toEqual(['expected exactly one MU.registerPlugin call at load, got 0'])
        const two = [ok().registrations[0], ok().registrations[0]]
        expect(registrationProblems(ok({ registrations: two }))).toEqual(['expected exactly one MU.registerPlugin call at load, got 2'])
    })

    it('reports a registered name, type or ext that differs from package.json (the silent runPlugin miss)', () => {
        const registrations = [[{ name: 'Epub', type: 'codeview', ext: 'x', run() {} }]]
        expect(registrationProblems(ok({ registrations }))).toEqual([
            'registered name "Epub" does not match package.json "EPUB"',
            'registered type "codeview" does not match package.json "exporter"',
            'registered ext "x" does not match package.json "epub"',
        ])
    })

    it('reports a filename property and a second argument to registerPlugin', () => {
        const registrations = [[{ name: 'EPUB', type: 'exporter', ext: 'epub', filename: 'a.js', run() {} }, 'EPUB']]
        expect(registrationProblems(ok({ registrations }))).toEqual([
            'registration has a filename property, which duplicates the real file name',
            'registerPlugin was given a second (name) argument',
        ])
    })

    it('reports a non-string, non-function registration value and an exporter without run', () => {
        const registrations = [[{ name: 'EPUB', type: 'exporter', ext: 'epub', count: 3 }]]
        expect(registrationProblems(ok({ registrations }))).toEqual([
            'registration value "count" is neither a string nor a function',
            'exporter registration has no run function',
        ])
    })

    it('reports package.json fields that leaked into the dist', () => {
        const source = `${pluginBanner(EXPORTER)}\nconst a = "Some Author <some@author.example>"\nconst d = "A fixture plugin for contract tests."\n`
        expect(registrationProblems(ok({ source }))).toEqual([
            'the dist contains the package.json author',
            'the dist contains the package.json description',
        ])
    })
})
