/**
 * Tests for YAML frontmatter and HTML preamble handling in importFn/exportFn.
 */

import { beforeAll, describe, test, expect, vi } from 'vitest'
import { MU } from 'markupeditor'
import { importMarkdown } from '../src/markdown.js'
const { schema } = MU

// markdown.js exports importMarkdown as a plain function; app.js is what
// wires it onto the real MU singleton when the app actually loads (see
// plugin.test.js). Importing it directly here keeps this suite independent
// of that wiring.
const importFn = importMarkdown

beforeAll(() => {
  vi.spyOn(MU, 'activeView').mockReturnValue({ state: { schema } })
})

describe('importFn — YAML frontmatter', () => {
  test('strips YAML from body and returns it in metadata', () => {
    const input = '---\ntitle: My Post\ndate: 2026-05-29\n---\n\n# Hello\n\nBody text.\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBe('title: My Post\ndate: 2026-05-29')
    expect(out.result).not.toContain('---')
    expect(out.result).not.toContain('title: My Post')
    expect(out.warnings).toEqual([])
  })

  test('no hr artifacts in output', () => {
    const input = '---\ntitle: Test\n---\n\n# Heading\n'
    const out = JSON.parse(importFn(input))
    expect(out.result).not.toContain('<hr')
    expect(out.metadata).toBe('title: Test')
  })

  test('no preamble: result unchanged, metadata absent', () => {
    const input = '# Hello\n\nJust a paragraph.\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBeUndefined()
    expect(out.result).toContain('Hello')
    expect(out.warnings).toEqual([])
  })
})

describe('importFn — YAML edge cases', () => {
  test('CRLF line endings are normalized', () => {
    const input = '---\r\ntitle: X\r\n---\r\n\r\n# Body\r\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBe('title: X')
    expect(out.result).toContain('Body')
    expect(out.warnings).toEqual([])
  })

  test('empty YAML block produces no metadata field', () => {
    const input = '---\n---\n\n# Body\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBeUndefined()
    expect(out.result).toContain('Body')
  })
})

describe('importFn — HTML preamble', () => {
  test('leading HTML block converted to code_block in editor HTML', () => {
    const input = '<div align="center">\n  <img src="logo.png">\n</div>\n\n# Hello\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBeUndefined()
    expect(out.result).toContain('<pre>')
    expect(out.result).toContain('logo.png')
    expect(out.warnings).toEqual([])
  })

  test('HTML comment as leading block is treated as preamble', () => {
    const input = '<!-- markdownlint-disable -->\n\n# Hello\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBeUndefined()
    expect(out.result).toContain('<pre>')
    expect(out.result).toContain('markdownlint-disable')
    expect(out.warnings).toEqual([])
  })

  test('mid-document HTML block fires warning, not treated as preamble', () => {
    const input = '# Heading\n\n<div>mid</div>\n\nParagraph.\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBeUndefined()
    expect(out.warnings.length).toBeGreaterThan(0)
  })

  test('leading standalone <img> is treated as preamble, not image node (AC-4)', () => {
    const input = '<img src="logo.png" alt="logo">\n\n# Body\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBeUndefined()
    expect(out.result).toContain('<pre>')
    expect(out.result).toContain('logo.png')
    expect(out.warnings).toEqual([])
  })
})

describe('importFn — YAML + HTML preamble', () => {
  test('both handled: YAML to metadata, HTML to code_block', () => {
    const input = '---\ntitle: Readme\n---\n\n<div align="center">\n  badge\n</div>\n\n# Body\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBe('title: Readme')
    expect(out.result).toContain('<pre>')
    expect(out.result).toContain('badge')
    expect(out.result).not.toContain('---')
    expect(out.warnings).toEqual([])
  })
})

describe('exportFn — preamble serializer (AC6, AC7)', () => {
  test('AC6: code_block at doc index 0 serializes as raw HTML (no fences)', async () => {
    const s = schema
    const { makeSerializer } = await import('../src/serializer.js')
    const { makeWarnings } = await import('../src/warnings.js')
    const codeBlock = s.nodes.code_block.create(null, [s.text('<div align="center">\n  badge\n</div>')])
    const para = s.nodes.paragraph.create(null, [s.text('Body.')])
    const doc = s.nodes.doc.create(null, [codeBlock, para])
    const warnings = makeWarnings()
    const md = makeSerializer(warnings).serialize(doc)
    expect(md).toContain('<div align="center">')
    expect(md).not.toContain('```')
    expect(warnings.get()).toEqual([])
  })

  test('AC7: code_block at index > 0 serializes as fenced block', async () => {
    const s = schema
    const { makeSerializer } = await import('../src/serializer.js')
    const { makeWarnings } = await import('../src/warnings.js')
    const para = s.nodes.paragraph.create(null, [s.text('Intro.')])
    const codeBlock = s.nodes.code_block.create(null, [s.text('<div>mid-doc html</div>')])
    const doc = s.nodes.doc.create(null, [para, codeBlock])
    const warnings = makeWarnings()
    const md = makeSerializer(warnings).serialize(doc)
    expect(md).toContain('```')
    expect(md).toContain('<div>mid-doc html</div>')
  })
})
