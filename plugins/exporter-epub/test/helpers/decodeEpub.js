import { unzipSync } from 'fflate'

// Unzips already-generated EPUB bytes (e.g. the base64 buffer returned by EpubExporter.run's
// full plugin envelope) into {path: utf8-text} for every entry, so tests can assert against
// real package contents rather than mocked calls.
export function decodeEpubBuffer(buffer) {
    const files = unzipSync(new Uint8Array(buffer))
    const parts = {}
    for (const [name, bytes] of Object.entries(files)) {
        parts[name] = new TextDecoder().decode(bytes)
    }
    return parts
}

// Reads the FIRST local file header directly out of the raw zip bytes -- unzipSync alone
// can't answer "is this entry first, and is it really stored (not deflated)?", which is
// exactly the EPUB spec's mimetype-entry requirement (container.js/epubexporter.js's comments
// explain why getting this wrong is what makes some reading systems refuse a file). ZIP local
// file header layout (APPNOTE.TXT 4.3.7): signature(4) version(2) flags(2) method(2) ...
// filenameLength(2) at offset 26, extraFieldLength(2) at offset 28, filename starts at 30.
export function firstLocalFileHeader(zipBytes) {
    const view = new DataView(zipBytes.buffer, zipBytes.byteOffset, zipBytes.byteLength)
    const signature = view.getUint32(0, true)
    if (signature !== 0x04034b50) throw new Error('not a zip local file header at offset 0')
    const compressionMethod = view.getUint16(8, true)
    const filenameLength = view.getUint16(26, true)
    const extraFieldLength = view.getUint16(28, true)
    const filename = new TextDecoder().decode(zipBytes.subarray(30, 30 + filenameLength))
    return { filename, compressionMethod, extraFieldLength }
}
