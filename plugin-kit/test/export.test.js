import { describe, it, expect } from 'vitest'
import { failureEnvelope, successEnvelope } from '../src/export.js'

describe('successEnvelope', () => {
    it('returns the {result, warnings, metadata} JSON the host decodes, with the bytes as base64', () => {
        const warnings = ['a warning']
        const envelope = JSON.parse(successEnvelope(new Uint8Array([72, 105]), warnings))
        expect(envelope).toEqual({ result: 'SGk=', warnings: ['a warning'], metadata: null })
    })

    it('has exactly the keys result, warnings and metadata', () => {
        expect(Object.keys(JSON.parse(successEnvelope(new Uint8Array(0), []))).sort()).toEqual(['metadata', 'result', 'warnings'])
    })

    it('accepts an ArrayBuffer', () => {
        expect(JSON.parse(successEnvelope(new Uint8Array([72, 105]).buffer, [])).result).toBe('SGk=')
    })
})

describe('failureEnvelope', () => {
    it('returns a null result and appends a conversion-failed warning naming the format', () => {
        const warnings = ['earlier']
        const envelope = JSON.parse(failureEnvelope(warnings, 'EPUB', new Error('boom')))
        expect(envelope).toEqual({ result: null, warnings: ['earlier', 'EPUB conversion failed: boom'], metadata: null })
    })

    it('has exactly the keys result, warnings and metadata', () => {
        expect(Object.keys(JSON.parse(failureEnvelope([], 'DOCX', new Error('x')))).sort()).toEqual(['metadata', 'result', 'warnings'])
    })
})
