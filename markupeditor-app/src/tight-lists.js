/**
 * Unwrap the paragraph of every list item that holds just one block besides nested lists, so the HTML
 * reads tight: `<li>text</li>`. An item with more than one such block keeps its paragraphs. The editor
 * wraps a bare run of text in a list item back into a paragraph when it reads the HTML.
 *
 * @param {Element} root - container whose descendant list items are rewritten in place
 */
export function tightenLists(root) {
  for (const item of root.querySelectorAll('li')) {
    const blocks = [...item.children].filter(child => child.tagName !== 'UL' && child.tagName !== 'OL')
    if (blocks.length !== 1 || blocks[0].tagName !== 'P' || item.firstElementChild !== blocks[0]) continue
    const paragraph = blocks[0]
    while (paragraph.firstChild) item.insertBefore(paragraph.firstChild, paragraph)
    paragraph.remove()
  }
}

/**
 * Tighten the lists in an HTML string.
 *
 * @param {string} html - HTML to rewrite
 * @returns {string} the HTML with tight list items
 */
export function tightenHtml(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  tightenLists(div)
  return div.innerHTML
}
