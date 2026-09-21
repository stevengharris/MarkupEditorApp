import { escapeXmlText } from './xmlEscape.js'

// The single XHTML content document this exporter produces -- MU.getHTML() carries one
// document body, so one content document is the natural, complete representation ("one or
// more" per the EPUB3 content-document requirement; splitting per-heading into multiple
// chapter files would be a real feature, not something this document's shape needs).
export function buildContentXhtml({ title, bodyHtml }) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head>
  <title>${escapeXmlText(title)}</title>
  <link rel="stylesheet" type="text/css" href="styles.css"/>
</head>
<body>
${bodyHtml}
</body>
</html>
`
}
