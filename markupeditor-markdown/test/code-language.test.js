/**
 * Tests for RDR-020 Phase 3: round-tripping the code_block schema's `language`
 * attribute through the fenced-code-block info string on import (parser.js)
 * and export (serializer.js).
 *
 * Covers:
 *  - P3.1 (parser.js): explicit `fence` tokenHandler override — first word of
 *    the info string only, strict null (not "") when no info string.
 *  - P3.2 (serializer.js): emitting node.attrs.language in the fence open line,
 *    without touching the RDR-015 HTML-preamble branch.
 *  - P3.3 / P3.4: additional export/import/round-trip coverage, including the
 *    RDR-015 preamble regression.
 */

import { beforeAll, describe, test, expect, vi } from 'vitest'
import { schema } from 'markupeditor/src/schema/index.js'
import { makeSerializer } from '../src/serializer.js'
import { makeParser } from '../src/parser.js'
import { makeWarnings } from '../src/warnings.js'
import { DOMSerializer } from 'prosemirror-model'
// The schema is created inside markupeditor-base, which resolves its own
// 'prosemirror-model' dependency (a different installed version than the one
// markupeditor-markdown resolves at its own top level). DOMParser does
// instanceof checks against its own Node/Fragment classes, so it must be the
// same module instance that built the schema, or parsing throws "multiple
// versions of prosemirror-model were loaded". Import it from markupeditor's
// own node_modules subpath to guarantee the same instance.
import { DOMParser as PMDOMParser } from 'markupeditor/node_modules/prosemirror-model'

// ---------------------------------------------------------------------------
// Helpers (mirrors round-trip.test.js conventions)
// ---------------------------------------------------------------------------

function serialize(doc) {
  const warnings = makeWarnings()
  const serializer = makeSerializer(warnings)
  return { md: serializer.serialize(doc), warnings }
}

function parse(md) {
  const warnings = makeWarnings()
  const parser = makeParser(schema, warnings)
  return { doc: parser.parse(md), warnings }
}

function docToHtml(doc) {
  const div = document.createElement('div')
  div.appendChild(DOMSerializer.fromSchema(schema).serializeFragment(doc.content))
  return div.innerHTML
}

function htmlToDoc(html) {
  const div = document.createElement('div')
  div.innerHTML = html
  return PMDOMParser.fromSchema(schema).parse(div)
}

// Find the first code_block node in a doc (depth-first).
function firstCodeBlock(doc) {
  let found = null
  doc.descendants(node => {
    if (found) return false
    if (node.type.name === 'code_block') {
      found = node
      return false
    }
    return true
  })
  return found
}

// ---------------------------------------------------------------------------
// Export: language attribute -> fence info string
// ---------------------------------------------------------------------------

describe('code_block export — language attribute', () => {
  test('language "swift" serializes to ```swift fence', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('Intro.')]),
      schema.nodes.code_block.create({ language: 'swift' }, [schema.text('let x = 1')])
    ])
    const { md, warnings } = serialize(doc)
    expect(md).toMatch(/^```swift\s*$/m)
    expect(md).toContain('let x = 1')
    // A clean language value is a no-op for sanitizeFenceLanguage — no warning.
    expect(warnings.get()).toHaveLength(0)
  })

  test('language null serializes to bare ``` fence (unchanged behavior)', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('Intro.')]),
      schema.nodes.code_block.create({ language: null }, [schema.text('const x = 1')])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/^```\s*$/m)
    expect(md).not.toMatch(/^```\S/m)
    expect(md).toContain('const x = 1')
  })

  // Injection guard: a hand-authored/directly-opened HTML file (not pasted —
  // paste strips classes before reaching the schema) can carry a
  // language-xxx class with arbitrary characters, since the schema's
  // getAttrs does not itself restrict them. A backtick surviving into the
  // fence-open line would corrupt the Markdown fence syntax on export.
  test('language containing a backtick is sanitized, not passed through raw', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('Intro.')]),
      schema.nodes.code_block.create({ language: 'js`' }, [schema.text('let x = 1')])
    ])
    const { md, warnings } = serialize(doc)
    expect(md).toMatch(/^```js\s*$/m)
    expect(md).not.toContain('```js`')
    // Sanitization silently mutating the value would break the convention
    // every other lossy path in this serializer follows (table class,
    // heading id, div, button, u/sub/sup all warn) — it must warn too.
    expect(warnings.get()).toHaveLength(1)
    expect(warnings.get()[0]).toContain('js`')
  })

  test('language that is entirely unsafe characters (embedded triple-backtick) falls back to a bare fence', () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text('Intro.')]),
      schema.nodes.code_block.create({ language: '```' }, [schema.text('let x = 1')])
    ])
    const { md } = serialize(doc)
    expect(md).toMatch(/^```\s*$/m)
    expect(md).not.toMatch(/^``````/m)
  })

  test('legitimate punctuation-bearing language values survive sanitization unchanged', () => {
    const cases = ['c++', 'c#', 'objective-c']
    for (const language of cases) {
      const doc = schema.nodes.doc.create(null, [
        schema.nodes.paragraph.create(null, [schema.text('Intro.')]),
        schema.nodes.code_block.create({ language }, [schema.text('code')])
      ])
      const { md } = serialize(doc)
      expect(md).toContain('```' + language + '\n')
    }
  })
})

// ---------------------------------------------------------------------------
// Import: fence info string -> language attribute
// ---------------------------------------------------------------------------

describe('code_block import — language attribute', () => {
  test('```swift fence produces code_block with language "swift"', () => {
    const { doc, warnings } = parse('Intro.\n\n```swift\nlet x = 1\n```\n')
    expect(warnings.get()).toHaveLength(0)
    const block = firstCodeBlock(doc)
    expect(block).not.toBeNull()
    expect(block.attrs.language).toBe('swift')
  })

  test('info string with trailing content: only the first word becomes language', () => {
    const { doc } = parse('Intro.\n\n```js {1,3}\nconst x = 1\n```\n')
    const block = firstCodeBlock(doc)
    expect(block.attrs.language).toBe('js')
  })

  test('bare fence with no info string produces language: null, strictly (not "")', () => {
    const { doc } = parse('Intro.\n\n```\nplain text\n```\n')
    const block = firstCodeBlock(doc)
    // Assert directly on parsed attrs — a string comparison via HTML/Markdown
    // round-trip cannot distinguish null from "" (both render without a class).
    expect(block.attrs.language).toBeNull()
    expect(block.attrs.language).not.toBe('')
  })
})

// ---------------------------------------------------------------------------
// Round-trip: HTML <pre><code class="language-X"> <-> Markdown
// ---------------------------------------------------------------------------

describe('code_block round-trip — HTML class <-> Markdown fence', () => {
  test('HTML pre>code.language-swift survives Markdown round-trip', () => {
    // Precede with a paragraph so the code_block is not at doc index 0 —
    // index 0 triggers the unrelated RDR-015 HTML-preamble heuristic.
    const original = htmlToDoc('<p>Intro.</p><pre><code class="language-swift">let x = 1</code></pre>')
    const block = firstCodeBlock(original)
    expect(block.attrs.language).toBe('swift')

    const { md, warnings: exportWarnings } = serialize(original)
    expect(exportWarnings.get()).toHaveLength(0)
    expect(md).toMatch(/^```swift\s*$/m)

    const { doc: reimported, warnings: importWarnings } = parse(md)
    expect(importWarnings.get()).toHaveLength(0)
    const html = docToHtml(reimported)
    expect(html).toContain('class="language-swift"')
  })
})

// ---------------------------------------------------------------------------
// RDR-015 preamble regression (P3.4): the positional preamble branch must
// remain completely unaffected by the new language attribute.
// ---------------------------------------------------------------------------

describe('RDR-015 preamble regression — serializer branch is language-attr-invariant', () => {
  test('preamble serialization is byte-identical regardless of attrs.language', () => {
    const text = '<div align="center">\n  badge\n</div>'
    const docWithLanguage = schema.nodes.doc.create(null, [
      schema.nodes.code_block.create({ language: 'html' }, [schema.text(text)])
    ])
    const docWithoutLanguage = schema.nodes.doc.create(null, [
      schema.nodes.code_block.create({ language: null }, [schema.text(text)])
    ])
    const { md: mdWith } = serialize(docWithLanguage)
    const { md: mdWithout } = serialize(docWithoutLanguage)
    expect(mdWith).toBe(mdWithout)
    expect(mdWith).not.toContain('```')
    expect(mdWith).not.toContain('language-html')
    expect(mdWith).toContain(text)
  })
})

describe('RDR-015 preamble regression — parser assigns language "html" to the injected preamble fence', () => {
  test('the synthetic ```html fence importFn injects around a preamble parses to language: "html"', () => {
    // importMarkdown (markup-editor-markdown.js) wraps a detected leading HTML
    // block in a synthetic ```html fence before handing off to makeParser —
    // see MU.importMarkdown's `replacement = '```html\n' + htmlContent + '\n```\n'`.
    // Exercise that exact fence shape directly through the parser (bypassing
    // the full plugin module, which pulls in markupeditor's compiled dist
    // bundle — see the pipeline describe block below for why that's blocked
    // in this environment) to confirm the preamble block ends up with
    // attrs.language === "html".
    const htmlContent = '<div align="center">\n  <img src="logo.png">\n</div>'
    const { doc, warnings } = parse('```html\n' + htmlContent + '\n```\n\n# Hello\n')
    expect(warnings.get()).toHaveLength(0)
    const preambleBlock = doc.firstChild
    expect(preambleBlock.type.name).toBe('code_block')
    expect(preambleBlock.attrs.language).toBe('html')
  })
})

describe('RDR-015 preamble regression — full importFn/exportFn pipeline', () => {
  let importFn
  let exportFn
  let mockMU

  beforeAll(async () => {
    document.body.innerHTML = '<markup-editor></markup-editor>'
    const el = document.querySelector('markup-editor')
    mockMU = { activeView: vi.fn(), registerPlugin: vi.fn() }
    el.MU = mockMU
    const mod = await import('../src/markup-editor-markdown.js')
    importFn = mod.importFn
    exportFn = mod.exportFn
  })

  // SKIPPED: pre-existing environment defect, not a Phase 3 regression.
  // Importing markup-editor-markdown.js pulls in `import { MU } from
  // "markupeditor"`, which loads markupeditor-base's compiled dist bundle.
  // That bundle calls a CSSStyleSheet API (`replaceSync`, used for adopted
  // stylesheets / Web Components) that this project's jsdom version does not
  // implement, so the import throws at module-evaluation time — before any
  // test body runs. Confirmed via `git stash`: test/plugin.test.js and
  // test/preamble.test.js already fail identically on unmodified main, with
  // the same "sheet$2.replaceSync is not a function" error. Unskip once that
  // jsdom/dist-bundle incompatibility is fixed (out of scope here — it is
  // unrelated to the parser.js/serializer.js changes in this phase).
  test.skip('HTML preamble gets attrs.language "html" internally, but re-export stays fence-free raw HTML', () => {
    mockMU.activeView.mockReturnValue({ state: { schema } })
    const input = '<div align="center">\n  <img src="logo.png">\n</div>\n\n# Hello\n'
    const out = JSON.parse(importFn(input))
    expect(out.warnings).toEqual([])
    expect(out.result).toContain('<pre>')

    // Parse the editor HTML back into a ProseMirror doc to inspect the
    // preamble node's attrs directly.
    const doc = htmlToDoc(out.result)
    const preambleBlock = doc.firstChild
    expect(preambleBlock.type.name).toBe('code_block')
    expect(preambleBlock.attrs.language).toBe('html')

    // Re-export: must still be de-fenced raw HTML — no fences, no visible
    // language marker — i.e. unchanged from pre-Phase-3 behavior.
    mockMU.activeView.mockReturnValue({ state: { doc } })
    const exported = JSON.parse(exportFn('unused'))
    expect(exported.result).not.toContain('```')
    expect(exported.result).not.toContain('language-html')
    expect(exported.result).toContain('<div align="center">')
    expect(exported.result).toContain('<img src="logo.png">')
  })
})
