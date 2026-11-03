import { MU } from 'markupeditor'

/**
 * Assign an id to any heading that a same-document internal link ("#slug") targets, so
 * the link round-trips as something that actually resolves. Markdown parsing never
 * assigns heading ids on its own (only the H1-H6 picker does, live in the editor); this
 * fills that in on import, but only for headings something in the document actually
 * points at -- a heading nothing links to stays without an id.
 *
 * A heading's candidate id is its slug from MU.headingSlugs, the same one MarkupEditor gives it
 * when a link to it is inserted: GitHub's slug, numbered -1, -2 for repeats. A link target that
 * never matches any heading is reported via `warnings` -- that's a broken reference, not routine
 * data loss.
 *
 * @param {Node} doc            ProseMirror document, freshly parsed
 * @param {Schema} schema
 * @param {object} warnings     warnings collector from makeWarnings()
 * @returns {Node}              doc with matched headings' id attrs filled in
 */
export function assignHeadingIds(doc, schema, warnings) {
  const linkType = schema.marks.link
  if (!linkType) return doc

  const targets = new Set()
  doc.descendants(node => {
    node.marks.forEach(mark => {
      if (mark.type === linkType && typeof mark.attrs.href === 'string' && mark.attrs.href.startsWith('#')) {
        targets.add(mark.attrs.href.slice(1))
      }
    })
  })
  if (targets.size === 0) return doc

  const unclaimed = new Set(targets)
  const slugs = headingSlugsOf(doc)
  let position = 0
  const result = mapHeadings(doc, heading => {
    const candidate = slugs[position++]
    if (!heading.attrs.id && unclaimed.has(candidate)) {
      unclaimed.delete(candidate)
      return candidate
    }
    return null
  })

  for (const missing of unclaimed) {
    warnings.add(`Internal link target "#${visibleTarget(missing)}" does not match any heading`)
  }
  return result
}

/**
 * `target` with characters that do not show on screen (format characters such as a zero-width joiner,
 * and variation selectors such as the one after many emoji) written as \u{XXXX}, so a mismatch
 * against a heading id can be seen.
 */
export function visibleTarget(target) {
  return target.replace(/[\p{Cf}\u{FE00}-\u{FE0F}\u{E0100}-\u{E01EF}]/gu, c => `\\u{${c.codePointAt(0).toString(16).toUpperCase()}}`)
}

// The slug of every heading of `doc` in document order, numbered the way GitHub does.
function headingSlugsOf(doc) {
  const texts = []
  doc.descendants(node => {
    if (node.type.name !== 'heading') return true
    texts.push(node.textContent)
    return false
  })
  return MU.headingSlugs(texts)
}

// Rebuild `node`, replacing each heading with a copy whose id is whatever `assign(heading)`
// returns (left alone if that's null). `assign` is called for every heading in document order,
// including those that already have an id. Builds new nodes via type.create/node.copy rather
// than mutating attrs in place, keeping this a proper immutable ProseMirror doc update.
function mapHeadings(node, assign) {
  if (node.type.name === 'heading') {
    const id = assign(node)
    if (id && !node.attrs.id) return node.type.create({ ...node.attrs, id }, node.content, node.marks)
  }
  if (node.childCount === 0) return node
  let content = node.content
  let changed = false
  node.forEach((child, _offset, index) => {
    const newChild = mapHeadings(child, assign)
    if (newChild !== child) {
      content = content.replaceChild(index, newChild)
      changed = true
    }
  })
  return changed ? node.copy(content) : node
}

/**
 * The ids to give id-less headings of a whole document that a same-document link ("#slug") targets and no
 * heading already claims. The first heading with a matching candidate id takes it.
 *
 * @returns {{pos: number, id: string}[]}
 */
export function headingIdAssignments(doc, schema) {
  const linkType = schema.marks.link
  if (!linkType) return []
  const targets = new Set()
  const claimed = new Set()
  doc.descendants(node => {
    if (node.type.name === 'heading' && node.attrs.id) claimed.add(node.attrs.id)
    node.marks.forEach(mark => {
      if (mark.type === linkType && typeof mark.attrs.href === 'string' && mark.attrs.href.length > 1 && mark.attrs.href.startsWith('#')) {
        targets.add(mark.attrs.href.slice(1))
      }
    })
  })
  const assignments = []
  if (targets.size === 0) return assignments
  const slugs = headingSlugsOf(doc)
  let position = 0
  doc.descendants((node, pos) => {
    if (node.type.name !== 'heading') return
    const candidate = slugs[position++]
    if (!node.attrs.id && targets.has(candidate) && !claimed.has(candidate)) {
      claimed.add(candidate)
      assignments.push({ pos, id: candidate })
    }
  })
  return assignments
}

/**
 * The targets of same-document links in `fragment` that no heading of `doc` carries as its id.
 *
 * @returns {string[]}
 */
export function unmatchedLinkTargets(fragment, doc, schema) {
  const linkType = schema.marks.link
  if (!linkType) return []
  const ids = new Set()
  doc.descendants(node => { if (node.type.name === 'heading' && node.attrs.id) ids.add(node.attrs.id) })
  const missing = new Set()
  fragment.descendants(node => {
    node.marks.forEach(mark => {
      if (mark.type !== linkType || typeof mark.attrs.href !== 'string' || mark.attrs.href.length < 2 || !mark.attrs.href.startsWith('#')) return
      const target = mark.attrs.href.slice(1)
      if (!ids.has(target)) missing.add(target)
    })
  })
  return [...missing]
}
