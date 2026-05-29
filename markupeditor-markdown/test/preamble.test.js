/**
 * Tests for YAML frontmatter and HTML preamble handling in importFn.
 * Export preamble serializer (code_block → raw HTML) is bead 6ro and not yet implemented.
 */

import { beforeAll, describe, test, expect, vi } from 'vitest'

let importFn

beforeAll(async () => {
  document.body.innerHTML = '<markup-editor></markup-editor>'
  const el = document.querySelector('markup-editor')
  el.MU = { activeView: vi.fn().mockReturnValue(null), registerPlugin: vi.fn() }
  const mod = await import('../src/markup-editor-markdown.js')
  importFn = mod.importFn
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

describe('importFn — HTML preamble', () => {
  test('leading HTML block converted to code_block in editor HTML', () => {
    const input = '<div align="center">\n  <img src="logo.png">\n</div>\n\n# Hello\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBeUndefined()
    expect(out.result).toContain('<pre>')
    expect(out.result).toContain('logo.png')
    expect(out.warnings).toEqual([])
  })

  test('mid-document HTML block fires warning, not treated as preamble', () => {
    const input = '# Heading\n\n<div>mid</div>\n\nParagraph.\n'
    const out = JSON.parse(importFn(input))
    expect(out.metadata).toBeUndefined()
    expect(out.warnings.length).toBeGreaterThan(0)
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
