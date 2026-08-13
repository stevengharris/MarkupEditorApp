import { Packer } from 'docx'
import JSZip from 'jszip'

// Unzips already-generated docx bytes (e.g. the base64 buffer returned by DocXExporter.run's
// full plugin envelope), so tests can assert against actual word/*.xml content.
export async function decodeDocxBuffer(buffer) {
    const zip = await JSZip.loadAsync(buffer)
    const parts = {}
    for (const [name, file] of Object.entries(zip.files)) {
        if (file.dir) continue
        parts[name] = await file.async('string')
    }
    return parts
}

// Generates the real docx bytes from a docx.Document and unzips them, so tests can assert
// against actual word/*.xml content rather than mocked API calls -- a converter that only
// satisfies its own mocks can still ship structurally broken output.
export async function decodeDocx(doc) {
    const buffer = await Packer.toBuffer(doc)
    return decodeDocxBuffer(buffer)
}

// Every w:styleId defined anywhere in a styles.xml string.
export function definedStyleIds(stylesXml) {
    return new Set([...stylesXml.matchAll(/w:styleId="([^"]+)"/g)].map((m) => m[1]))
}

// Every w:basedOn target referenced anywhere in a styles.xml string, regardless of which
// style declares it.
export function basedOnTargets(stylesXml) {
    return [...stylesXml.matchAll(/<w:basedOn w:val="([^"]+)"/g)].map((m) => m[1])
}
