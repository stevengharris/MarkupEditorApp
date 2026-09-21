import { escapeXmlText, escapeXmlAttr } from './xmlEscape.js'

// Builds a nested tree from a flat, level-tagged heading list (htmlToXhtml.js's
// extractHeadings) using a standard TOC-nesting stack: pop back to the nearest ancestor
// shallower than the current heading, then attach. Handles a non-monotonic sequence (e.g. h1
// straight to h3, no h2) by attaching at the nearest existing ancestor rather than assuming
// every level in between is present.
function buildHeadingTree(headings) {
    const root = { level: 0, children: [] }
    const stack = [root]
    for (const heading of headings) {
        while (stack.length > 1 && stack[stack.length - 1].level >= heading.level) stack.pop()
        const node = { ...heading, children: [] }
        stack[stack.length - 1].children.push(node)
        stack.push(node)
    }
    return root
}

function serializeTocList(node) {
    if (node.children.length === 0) return ''
    const items = node.children.map((child) => {
        const label = escapeXmlText(child.text)
        const href = `content.xhtml#${escapeXmlAttr(child.id)}`
        return `<li><a href="${href}">${label}</a>${serializeTocList(child)}</li>`
    })
    return `<ol>${items.join('')}</ol>`
}

// EPUB3 nav document (required by the OPF manifest's properties="nav" item). `headings` comes
// from htmlToXhtml.js's extractHeadings -- when the document has no id-bearing heading at all,
// falls back to a single entry pointing at the whole content document rather than an empty,
// spec-technically-valid-but-useless <nav>.
export function buildNavXhtml({ title, headings = [] }) {
    const tree = buildHeadingTree(headings)
    const tocList = headings.length > 0
        ? serializeTocList(tree)
        : `<ol><li><a href="content.xhtml">${escapeXmlText(title)}</a></li></ol>`

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXmlText(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
  <nav epub:type="toc" id="toc">
    <h1>${escapeXmlText(title)}</h1>
    ${tocList}
  </nav>
</body>
</html>
`
}
