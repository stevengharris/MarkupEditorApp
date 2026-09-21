// btoa/atob operate on binary strings, not bytes directly -- chunk the encode to stay well
// under any engine's call-stack argument-count limit (a single String.fromCharCode(...spread)
// over a real document-sized buffer overflows it).
const CHUNK_SIZE = 0x8000

// Accepts a Uint8Array (including a Node Buffer) or an ArrayBuffer.
export function bytesToBase64(input) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input)
    let binary = ''
    for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK_SIZE))
    }
    return btoa(binary)
}

export function base64ToBytes(base64) {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
}
