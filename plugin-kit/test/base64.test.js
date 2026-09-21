import { describe, it, expect } from 'vitest'
import { base64ToBytes, bytesToBase64 } from '../src/base64.js'

describe('bytesToBase64', () => {
    it('encodes empty input to an empty string', () => {
        expect(bytesToBase64(new Uint8Array(0))).toBe('')
        expect(bytesToBase64(new ArrayBuffer(0))).toBe('')
    })

    it('encodes known bytes to the expected base64, from a Uint8Array or an ArrayBuffer', () => {
        const bytes = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
        expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString('base64'))
        expect(bytesToBase64(bytes.buffer)).toBe(Buffer.from(bytes).toString('base64'))
    })

    it('accepts a Node Buffer, which is a Uint8Array subclass', () => {
        expect(bytesToBase64(Buffer.from('Hello'))).toBe('SGVsbG8=')
    })

    it('does not stack overflow on a large buffer and round-trips byte-exact', () => {
        const size = 300_000 // well past a naive String.fromCharCode(...spread) argument-count limit
        const bytes = new Uint8Array(size)
        for (let i = 0; i < size; i++) bytes[i] = i % 256
        expect(() => bytesToBase64(bytes)).not.toThrow()
        expect(Buffer.from(bytesToBase64(bytes), 'base64').equals(Buffer.from(bytes))).toBe(true)
    })
})

describe('base64ToBytes', () => {
    it('decodes base64 back to the original bytes', () => {
        const bytes = new Uint8Array([0, 1, 2, 253, 254, 255])
        expect(Array.from(base64ToBytes(bytesToBase64(bytes)))).toEqual(Array.from(bytes))
    })
})
