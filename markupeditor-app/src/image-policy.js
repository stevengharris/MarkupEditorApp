// A scheme such as "https:" or "data:"; a Windows drive letter is not expected in image sources.
const SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:/

/**
 * Whether an image source is a relative path: non-blank, no scheme, and not rooted at `/`, `//` or `\`.
 * Tab, carriage return and line feed are ignored anywhere in a URL, and leading control characters and
 * spaces are skipped, so those are removed before the checks.
 *
 * @param {*} src
 * @returns {boolean}
 */
export function isRelativeImageSrc(src) {
  if (typeof src !== 'string') return false
  const url = src.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+/, '')
  if (url === '') return false
  if (SCHEME.test(url)) return false
  return !/^[/\\]/.test(url)
}

/**
 * Convert the images in `fragment` that do not have a relative source into links, so importing Markdown
 * never makes the editor load a remote or absolute resource. The link text is the alt text, or the source
 * when there is none. Images whose source is in `keepSrcs` are left alone.
 *
 * @param {object} fragment - ProseMirror Node (the parsed document)
 * @param {object} schema
 * @param {Set<string>} keepSrcs
 * @returns {{fragment: object, warnings: string[]}}
 */
export function applyImagePolicy(fragment, schema, keepSrcs) {
  const warnings = []
  const linkType = schema.marks.link

  const rewrite = (node) => {
    if (node.type.name === 'image') {
      const src = node.attrs.src
      if (isRelativeImageSrc(src) || keepSrcs.has(src)) return [node]
      warnings.push(`Image converted to a link because its source is not a relative path: ${src}`)
      const label = node.attrs.alt || src
      if (!label) return []
      const link = linkType.create({ href: src, title: null })
      // Inside a link already, the text keeps that link and its destination.
      const inLink = node.marks.some(mark => mark.type === linkType)
      return [schema.text(label, inLink ? node.marks : link.addToSet(node.marks))]
    }
    if (node.isLeaf) return [node]
    const children = []
    node.forEach(child => children.push(...rewrite(child)))
    return [node.type.create(node.attrs, children, node.marks)]
  }

  return { fragment: rewrite(fragment)[0], warnings }
}
