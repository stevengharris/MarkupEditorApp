// Shared by htmlToXhtml.js, opf.js, and nav.js -- every XML text/attribute value this plugin
// emits (content-document text, dc:title, nav labels, ...) goes through one of these two.
export function escapeXmlText(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function escapeXmlAttr(value) {
    return String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
