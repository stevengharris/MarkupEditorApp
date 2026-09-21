import { bytesToBase64 } from './base64.js'

// The plugin envelope shape ({result, warnings, metadata}) is a contract with the Swift side
// (MarkupWKWebView+Extension.swift's runExporter): any exporter plugin returns exactly this
// JSON string, regardless of which library produced the bytes. `result` is the exported file,
// base64-encoded, or null on failure; `metadata` is reserved and always null.
function envelope(result, warnings) {
    return JSON.stringify({ result, warnings, metadata: null })
}

// `bytes` is a Uint8Array or ArrayBuffer holding the exported file.
export function successEnvelope(bytes, warnings) {
    return envelope(bytesToBase64(bytes), warnings)
}

// Appends "<format> conversion failed: <message>" to `warnings` and returns a null-result
// envelope. A thrown exception would otherwise reach the host as an opaque missing result.
export function failureEnvelope(warnings, format, error) {
    warnings.push(`${format} conversion failed: ${error.message}`)
    return envelope(null, warnings)
}
