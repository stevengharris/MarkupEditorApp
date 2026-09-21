// A minimal default stylesheet so the exported EPUB doesn't render as completely unstyled
// plain text -- most reflowable EPUB reading systems apply their user/theme styles on top of
// this anyway, so this only needs to cover the constructs markup.css gives real visual meaning
// to (table border classes, code font, blockquote indent), not attempt a full port.
// TABLE_BORDER_COLOR matches markup.css's value, same as htmlToDocx.js's TABLE_BORDER_COLOR.
const TABLE_BORDER_COLOR = '#DDD'

export const STYLESHEET = `body {
  font-family: -apple-system, BlinkMacSystemFont, "Helvetica Neue", Arial, sans-serif;
  line-height: 1.4;
}
code, pre {
  font-family: "SF Mono", Menlo, Consolas, monospace;
}
pre {
  background-color: #F8F8F8;
  padding: 0.5em;
  overflow-x: auto;
}
code {
  background-color: #F8F8F8;
}
pre code {
  background-color: transparent;
}
blockquote {
  margin-left: 0;
  padding-left: 1em;
  border-left: 3px solid ${TABLE_BORDER_COLOR};
}
img {
  max-width: 100%;
}
table {
  width: 100%;
  border-collapse: collapse;
}
table, th, td {
  border: 1px solid ${TABLE_BORDER_COLOR};
  padding: 0.4em;
}
/* Schema: table cell content is "block+", always at least one <p> -- the browser default
   ~1em top/bottom paragraph margin stacks with the cell's padding above, making every
   cell (even a single short line) render as a tall, sparse-looking row. Zeroed by default;
   a SECOND paragraph in the same cell still gets separation from the one before it. */
td p, th p {
  margin: 0;
}
td p + p, th p + p {
  margin-top: 0.5em;
}
table.bordered-table-none, table.bordered-table-none th, table.bordered-table-none td {
  border: none;
}
table.bordered-table-outer th, table.bordered-table-outer td {
  border: none;
}
table.bordered-table-outer {
  border: 1px solid ${TABLE_BORDER_COLOR};
}
table.bordered-table-header th {
  border: 1px solid ${TABLE_BORDER_COLOR};
}
table.bordered-table-header td {
  border: none;
}
hr {
  border: none;
  border-bottom: 1px solid #000;
}
`
