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

  test('punctuation is dropped from the id, as GitHub does', () => {
    const { doc, warnings } = parseWithIds("[Jump](#whats-new-really)\n\n## What's new, really?\n")
    expect(headings(doc)[0].attrs.id).toBe('whats-new-really')
    expect(warnings.get().length).toBe(0)
  })

  test('hyphens, underscores and digits are kept', () => {
    const { doc } = parseWithIds('[Jump](#uber_cool-2-step)\n\n## Uber_cool 2-step\n')
    expect(headings(doc)[0].attrs.id).toBe('uber_cool-2-step')
  })

  test.each([
    ['Über cool', 'über-cool'],
    ['Привет non-latin 你好', 'привет-non-latin-你好'],
    ['Café, déjà vu!', 'café-déjà-vu'],
  ])('letters of any alphabet are kept: %s', (text, slug) => {
    const { doc, warnings } = parseWithIds(`[Jump](#${slug})\n\n## ${text}\n`)
    expect(headings(doc)[0].attrs.id).toBe(slug)
    expect(warnings.get().length).toBe(0)
  })

  test('a link to a heading is stored with the unencoded target the heading id has', () => {
    const { doc } = parseWithIds('[Jump](#über-cool)\n\n## Über cool\n')
    let href = null
    doc.descendants(n => n.marks.forEach(m => { if (m.type.name === 'link') href = m.attrs.href }))
    expect(href).toBe('#über-cool')
  })

  test('an external link keeps its encoded address', () => {
    const { doc } = parseWithIds('[Out](https://example.com/über)\n')
    let href = null
    doc.descendants(n => n.marks.forEach(m => { if (m.type.name === 'link') href = m.attrs.href }))
    expect(href).toBe('https://example.com/%C3%BCber')
  })

  test('superscript and circled digits are dropped, as GitHub does', () => {
    const { doc } = parseWithIds('[Jump](#x--y)\n\n## x\u00b2 \u2460 y\n')
    expect(headings(doc)[0].attrs.id).toBe('x--y')
  })

  test('an emoji variation selector is kept, as GitHub does', () => {
    const { doc } = parseWithIds('[Jump](#i-\ufe0f-it)\n\n## I \u2764\ufe0f it\n')
    expect(headings(doc)[0].attrs.id).toBe('i-\ufe0f-it')
  })

  test('a link target with a non-printing character is shown with it escaped in the warning', () => {
    const { warnings } = parseWithIds('[Jump](#i-\ufe0f-it)\n\n## Somewhere\n')
    expect(warnings.get()).toEqual(['Internal link target "#i-\\u{FE0F}-it" does not match any heading'])
  })

  test('the cut to 40 characters does not split a character outside the BMP', () => {
    const text = 'a'.repeat(39) + '\u{1D49C}\u{1D49C}'
    const { doc } = parseWithIds(`[Jump](#${'a'.repeat(39)}\u{1D49C})\n\n## ${text}\n`)
    expect(headings(doc)[0].attrs.id).toBe('a'.repeat(39) + '\u{1D49C}')
  })

  test('a repeated heading takes a hyphen and number, as GitHub does', () => {
    const { doc, warnings } = parseWithIds('[One](#setup) [Two](#setup-1) [Three](#setup-2)\n\n## Setup\n\n## Setup\n\n## Setup\n')
    expect(headings(doc).map(h => h.attrs.id)).toEqual(['setup', 'setup-1', 'setup-2'])
    expect(warnings.get().length).toBe(0)
  })

  test('the number counts every heading with the same text, linked to or not', () => {
    const { doc } = parseWithIds('[Two](#setup-1)\n\n## Setup\n\n## Setup\n')
    expect(headings(doc).map(h => h.attrs.id)).toEqual([null, 'setup-1'])
  })

  test('the id is cut to 40 characters', () => {
    const { doc } = parseWithIds('[Jump](#this-paragraph-text-is-long-enough-to-be)\n\n###### This paragraph text is long enough to be cut at forty characters\n')
    expect(headings(doc)[0].attrs.id).toBe('this-paragraph-text-is-long-enough-to-be')
  })
})
