import { describe, test, expect } from 'vitest'
import { schema } from 'markupeditor/src/schema/index.js'
import { makeSerializer } from '../src/serializer.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serialize(doc) {
  const warnings = makeWarnings()
  const serializer = makeSerializer(warnings)
  const md = serializer.serialize(doc)
  return { md, warnings: warnings.get() }
}

function parse(md) {
  const warnings = makeWarnings()
  const parser = makeParser(schema, warnings)
  const doc = parser.parse(md)
  return { doc, warnings: warnings.get() }
}

// ---------------------------------------------------------------------------
// Empty document
// ---------------------------------------------------------------------------

describe('empty document', () => {
  test('doc with single empty paragraph serializes without error', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [])
    ])
    // Should not throw
    expect(() => serialize(doc)).not.toThrow()
    const { md } = serialize(doc)
    // Output is empty or just whitespace — no meaningful content
    expect(typeof md).toBe('string')
  })
})

// ---------------------------------------------------------------------------
// Nested lists
// ---------------------------------------------------------------------------

describe('nested lists', () => {
  test('bullet list containing ordered list serializes with correct indentation', () => {
    const innerOrderedList = schema.nodes.ordered_list.create(null, [
      schema.nodes.list_item.create(null, [
        schema.nodes.paragraph.create(null, [schema.text('inner 1')])
      ]),
      schema.nodes.list_item.create(null, [
        schema.nodes.paragraph.create(null, [schema.text('inner 2')])
      ])
    ])

    const doc = schema.nodes.doc.create(null, [
      schema.nodes.bullet_list.create(null, [
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, [schema.text('outer A')]),
          innerOrderedList
        ]),
        schema.nodes.list_item.create(null, [
          schema.nodes.paragraph.create(null, [schema.text('outer B')])
        ])
      ])
    ])

    const { md } = serialize(doc)

    // Outer bullet items present
    expect(md).toMatch(/[-*+]\s+outer A/)
    expect(md).toMatch(/[-*+]\s+outer B/)

    // Inner ordered items present with indentation (at least 2 leading spaces)
    expect(md).toMatch(/^\s{2,}\d+\.\s+inner 1/m)
    expect(md).toMatch(/^\s{2,}\d+\.\s+inner 2/m)
  })
})

// ---------------------------------------------------------------------------
// Code block content preservation
// ---------------------------------------------------------------------------

describe('code block', () => {
  test('code block content is preserved exactly (no language hint in schema)', () => {
    const code = 'function greet(name) {\n  return "Hello, " + name\n}'
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.code_block.create(null, [schema.text(code)])
    ])
    const { md } = serialize(doc)
    expect(md).toContain(code)
  })
})

// ---------------------------------------------------------------------------
// Link with special characters in URL
// ---------------------------------------------------------------------------

describe('link with special URL characters', () => {
  test('URL containing query string special chars is preserved in output', () => {
    const url = 'https://example.com/foo?a=1&b=2'
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text('link text', [schema.marks.link.create({ href: url, title: null })])
      ])
    ])
    const { md } = serialize(doc)
    expect(md).toContain(url)
    expect(md).toMatch(/\[link text\]/)
  })
})
