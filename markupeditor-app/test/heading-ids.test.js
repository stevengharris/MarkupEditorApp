import { describe, test, expect } from 'vitest'
import { MU } from 'markupeditor'
const { schema } = MU
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { assignHeadingIds } from '../src/heading-ids.js'

function parseWithIds(md) {
  const warnings = makeWarnings()
  const parser = makeParser(schema, warnings)
  const doc = assignHeadingIds(parser.parse(md), schema, warnings)
  return { doc, warnings }
}

function headings(doc) {
  const found = []
  doc.descendants(n => { if (n.type.name === 'heading') found.push(n) })
  return found
}

describe('assignHeadingIds', () => {
  test('assigns id to the heading a same-document link targets', () => {
    const { doc, warnings } = parseWithIds('[Jump](#getting-started)\n\n## Getting Started\n')
    expect(headings(doc)[0].attrs.id).toBe('getting-started')
    expect(warnings.get().length).toBe(0)
  })

  test('does not assign an id to a heading nothing links to', () => {
    const { doc, warnings } = parseWithIds('## Untouched\n')
    expect(headings(doc)[0].attrs.id).toBe(null)
    expect(warnings.get().length).toBe(0)
  })

  test('warns when a link target matches no heading', () => {
    const { warnings } = parseWithIds('[Jump](#nowhere)\n\n## Somewhere\n')
    expect(warnings.get().some(w => w.includes('#nowhere'))).toBe(true)
  })

  test('first matching heading wins when two headings share the same computed id', () => {
    const { doc, warnings } = parseWithIds('[Jump](#dup)\n\n## Dup\n\n## Dup\n')
    const [first, second] = headings(doc)
    expect(first.attrs.id).toBe('dup')
    expect(second.attrs.id).toBe(null)
    expect(warnings.get().length).toBe(0)
  })

  test('external links are ignored', () => {
    const { doc, warnings } = parseWithIds('[Ext](https://example.com)\n\n## Example\n')
    expect(headings(doc)[0].attrs.id).toBe(null)
    expect(warnings.get().length).toBe(0)
  })

  test('no internal links in the document is a no-op, no warnings', () => {
    const { doc, warnings } = parseWithIds('## A\n\n## B\n\nSome text with no links at all.\n')
    expect(headings(doc).every(h => h.attrs.id === null)).toBe(true)
    expect(warnings.get().length).toBe(0)
  })
})
